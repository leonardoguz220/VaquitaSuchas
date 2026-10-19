import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import { retentionCutoff } from '../domain/retention.js';
import { DisputesRepository } from '../repositories/disputes.repository.js';
import { MessagesRepository } from '../repositories/messages.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';

const BATCH_SIZE = 200;

export interface JoinRetentionResult {
  purged: number;
  failed: number;
}

/**
 * Retención de 2 meses (RNF-010-09, CA-010-44): borra el chat, sus imágenes y el comprobante de
 * las solicitudes finales, y la evidencia de los reclamos resueltos; conserva la línea de tiempo,
 * las claves y la decisión. No toca solicitudes con reclamo abierto. Primero se borran los
 * archivos (el almacén no falla si ya no existen) y luego se marca la fecha, así un corte en
 * medio se recupera en el siguiente tick. Un archivo que no se pudo borrar no se marca.
 */
@Injectable()
export class JoinRetentionService {
  private readonly logger = new Logger(JoinRetentionService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: FileStorage,
    private readonly requests: RequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly disputes: DisputesRepository,
  ) {}

  async purgeExpired(now: Date): Promise<JoinRetentionResult> {
    const cutoff = retentionCutoff(now);
    const result: JoinRetentionResult = { purged: 0, failed: 0 };

    for (const item of await this.disputes.listPurgeCandidates(this.db, cutoff, BATCH_SIZE)) {
      await this.guard(result, async () => {
        for (const key of item.keys) await this.storage.delete(key);
        await this.disputes.markEvidencePurged(this.db, item.id, now);
      });
    }

    for (const item of await this.requests.listPurgeCandidates(this.db, cutoff, BATCH_SIZE)) {
      await this.guard(result, async () => {
        const keys = await this.messages.listImageKeys(this.db, item.id);
        if (item.proofKey !== null) keys.push(item.proofKey);
        for (const key of keys) await this.storage.delete(key);
        await this.db.withTransaction(async (tx) => {
          await this.messages.purgeByRequest(tx, item.id);
          await this.requests.markContentPurged(tx, item.id, now);
        });
      });
    }
    return result;
  }

  private async guard(result: JoinRetentionResult, work: () => Promise<void>): Promise<void> {
    try {
      await work();
      result.purged += 1;
    } catch (error) {
      result.failed += 1;
      // Ni claves ni mensajes del almacén: solo el tipo de error.
      this.logger.error(
        `join-requests.retention no pudo limpiar un elemento: ${error instanceof Error ? error.name : 'error'}.`,
      );
    }
  }
}
