import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';

/**
 * Únicos borrados de `maintenance.cleanup`. Cada método recibe el instante de corte (calculado
 * por el dominio con el `Clock`) y devuelve cuántas filas borró. Las columnas de corte salen de
 * las migraciones 0002, 0003 y 0004.
 *
 * `rate_limit_events` es de solo anexado, pero la migración 0005 deja borrar sus filas de más de
 * 24 horas (T033); un corte más reciente haría fallar el DELETE con `restrict_violation` (23001).
 */
@Injectable()
export class MaintenanceCleanupRepository {
  constructor(private readonly db: DbService) {}

  deleteJobRunsBefore(cutoff: Date): Promise<number> {
    return this.deleteBefore('DELETE FROM job_runs WHERE started_at < $1', cutoff);
  }

  deleteRateLimitEventsBefore(cutoff: Date): Promise<number> {
    return this.deleteBefore('DELETE FROM rate_limit_events WHERE occurred_at < $1', cutoff);
  }

  deleteTelegramUpdatesBefore(cutoff: Date): Promise<number> {
    return this.deleteBefore('DELETE FROM telegram_updates WHERE received_at < $1', cutoff);
  }

  private async deleteBefore(sql: string, cutoff: Date): Promise<number> {
    const result = await this.db.query(sql, [cutoff]);
    return result.rowCount ?? 0;
  }
}
