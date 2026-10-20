import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import { retentionCutoff } from '../../billing/domain/retention.js';
import { DisputesRepository } from '../repositories/disputes.repository.js';
import { MessagesRepository } from '../repositories/messages.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';

const BATCH_SIZE = 200;

export interface JoinRequestRetentionResult {
  purged: number;
  failed: number;
}

/**
 * Tarea `join_requests.retention` (spec 010, research R4, RNF-010-09, CA-010-44): 2 meses después
 * del estado final de una solicitud (o de la resolución de su último reclamo) se eliminan su chat,
 * las imágenes, el comprobante, el QR copiado y la evidencia de los reclamos. Se conservan la línea
 * de tiempo, la decisión, la referencia de pago y las claves (la base solo admite marcar
 * `content_purged_at` / `evidence_purged_at`). Una solicitud con un reclamo abierto no se toca.
 *
 * Cada solicitud va en su transacción: se bloquea (`SKIP LOCKED`), se vuelve a comprobar que
 * cumple, se borran los archivos y se borra el chat con `vaquita.allow_purge`. Si falla el borrado
 * de un archivo la transacción se revierte, nada se marca y el día siguiente se reintenta
 * (`FileStorage.delete` es idempotente, así que un corte a medias tampoco bloquea).
 */
@Injectable()
export class JoinRequestsRetentionService {
  private readonly logger = new Logger(JoinRequestsRetentionService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: FileStorage,
    private readonly requests: RequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly disputes: DisputesRepository,
  ) {}

  async purgeExpiredContent(now: Date): Promise<JoinRequestRetentionResult> {
    const cutoff = retentionCutoff(now);
    const result: JoinRequestRetentionResult = { purged: 0, failed: 0 };
    const failed = new Set<string>();
    for (;;) {
      const batch = (
        await this.requests.listPurgeableIds(this.db, cutoff, BATCH_SIZE + failed.size)
      )
        .filter((id) => !failed.has(id))
        .slice(0, BATCH_SIZE);
      if (batch.length === 0) return result;
      let progressed = false;
      for (const id of batch) {
        try {
          if (await this.purgeOne(id, cutoff, now)) {
            result.purged += 1;
            progressed = true;
          } else {
            // Bloqueada por una acción en curso o ya no cumple: se deja para el siguiente día.
            failed.add(id);
          }
        } catch (error) {
          failed.add(id);
          result.failed += 1;
          // Ni claves de archivos ni mensajes del almacén: solo el tipo de error.
          this.logger.error(
            `join_requests.retention no pudo limpiar una solicitud: ${error instanceof Error ? error.name : 'error'}.`,
          );
        }
      }
      if (!progressed) return result;
    }
  }

  private purgeOne(id: string, cutoff: Date, now: Date): Promise<boolean> {
    return this.db.withTransaction(async (tx) => {
      const record = await this.requests.findByIdForUpdateSkipLocked(tx, id);
      if (!record || record.contentPurgedAt !== null) return false;
      // Un reclamo pudo abrirse o resolverse desde que se listó: se comprueba con la fila bloqueada.
      if ((await this.requests.listPurgeableIds(tx, cutoff, 1, id)).length === 0) return false;

      const keys = new Set<string>(await this.messages.listImageKeys(tx, id));
      for (const key of [record.proofKey, record.paymentQrKey]) if (key) keys.add(key);
      for (const dispute of await this.disputes.listByRequest(tx, id)) {
        for (const key of [dispute.evidenceKey, dispute.responseEvidenceKey])
          if (key) keys.add(key);
      }
      for (const key of keys) await this.storage.delete(key);

      await this.messages.purgeByRequest(tx, id);
      await this.disputes.markEvidencePurged(tx, id, now);
      await this.requests.markContentPurged(tx, id, now);
      return true;
    });
  }
}
