import { cleanupCutoffs } from '../domain/maintenance-cleanup.js';
import type { MaintenanceCleanupRepository } from '../maintenance-cleanup.repository.js';
import type { JobContext, ScheduledJob } from '../scheduled-job.js';

/**
 * Retención de datos operativos (RF-000-14): borra `job_runs` de más de 30 días,
 * `rate_limit_events` de más de 24 horas y `telegram_updates` de más de 7 días. Es idempotente:
 * repetirla no borra nada más. Los cortes se calculan con el `now` del contexto (Clock).
 *
 * Cada tabla se limpia por separado: si una falla (hoy `rate_limit_events`, ver T033) las demás
 * igual se limpian, y al final se relanza el primer error para que la ejecución quede en `error`.
 */
export class MaintenanceCleanupJob implements ScheduledJob {
  readonly name = 'maintenance.cleanup';
  readonly intervalSeconds = 3600;

  constructor(private readonly repository: MaintenanceCleanupRepository) {}

  async run(ctx: JobContext): Promise<number> {
    const cutoffs = cleanupCutoffs(ctx.now);
    const steps = [
      () => this.repository.deleteJobRunsBefore(cutoffs.jobRunsBefore),
      () => this.repository.deleteRateLimitEventsBefore(cutoffs.rateLimitEventsBefore),
      () => this.repository.deleteTelegramUpdatesBefore(cutoffs.telegramUpdatesBefore),
    ];

    let total = 0;
    let firstFailure: unknown;
    let failed = false;
    for (const step of steps) {
      try {
        total += await step();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    if (failed) {
      throw firstFailure;
    }
    return total;
  }
}
