import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import { retentionCutoff } from '../domain/retention.js';
import { ReceiptsRepository } from '../repositories/receipts.repository.js';

const BATCH_SIZE = 200;

export interface RetentionResult {
  deleted: number;
  failed: number;
}

/**
 * Retención de comprobantes (RN-002-06, CA-002-33): dos meses después de cerrar un grupo se borran
 * del almacén los archivos de sus comprobantes y se marca `file_deleted_at`; las filas, los montos
 * y los estados del historial se conservan. Es idempotente y se recupera sola: si el borrado de un
 * archivo falla no se marca la fecha y el siguiente tick lo reintenta. `FileStorage.delete` no
 * falla si el archivo ya no existe, así que un corte entre borrar y marcar tampoco bloquea.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: FileStorage,
    private readonly receipts: ReceiptsRepository,
  ) {}

  async purgeExpiredReceipts(now: Date): Promise<RetentionResult> {
    const cutoff = retentionCutoff(now);
    const result: RetentionResult = { deleted: 0, failed: 0 };
    const skipped = new Set<string>();

    for (;;) {
      const batch = (
        await this.receipts.listExpiredFiles(this.db, cutoff, BATCH_SIZE + skipped.size)
      )
        .filter((file) => !skipped.has(file.id))
        .slice(0, BATCH_SIZE);
      if (batch.length === 0) return result;
      for (const file of batch) {
        try {
          await this.storage.delete(file.fileKey);
          await this.receipts.markFileDeleted(this.db, file.id, now);
          result.deleted += 1;
        } catch (error) {
          skipped.add(file.id);
          result.failed += 1;
          // Ni la clave del archivo ni el mensaje del almacén: solo el tipo de error.
          this.logger.error(
            `billing.retention no pudo borrar un comprobante: ${error instanceof Error ? error.name : 'error'}.`,
          );
        }
      }
    }
  }
}
