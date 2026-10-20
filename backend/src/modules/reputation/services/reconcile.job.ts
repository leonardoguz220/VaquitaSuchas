import { Logger } from '@nestjs/common';
import type { DbService } from '../../../shared/db/db.service.js';
import type { JobRunsRepository } from '../../../shared/jobs/job-runs.repository.js';
import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import type { ReputationRepository } from '../repositories/reputation.repository.js';
import type { ReputationService } from './reputation.service.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;
const BATCH = 100;
const THIRTEEN_MONTHS = 13;

/**
 * `reputation.reconcile` (RF-007-05, CA-007-14): una vez al día recalcula desde los cobros a
 * quienes tuvieron cobros en los últimos 13 meses, a quienes ya tienen calificación guardada (el
 * paso del tiempo la cambia) y a todos si cambió `RULES_VERSION`. Corrige lo que difiere y deja
 * el total de diferencias (`drift`) como advertencia de la ejecución. Devuelve cuántas personas
 * recalculó.
 */
export class ReputationReconcileJob implements ScheduledJob {
  readonly name = 'reputation.reconcile';
  readonly intervalSeconds = ONE_DAY_SECONDS;
  private readonly logger = new Logger(ReputationReconcileJob.name);

  constructor(
    private readonly repository: ReputationRepository,
    private readonly reputation: ReputationService,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
  ) {}

  async run(ctx: JobContext): Promise<number> {
    const since = new Date(ctx.now.getTime());
    since.setUTCMonth(since.getUTCMonth() - THIRTEEN_MONTHS);
    const userIds = await this.repository.userIdsToReconcile(ctx.db, since, RULES_VERSION);
    let drift = 0;
    let failed = 0;
    for (let i = 0; i < userIds.length; i += BATCH) {
      for (const userId of userIds.slice(i, i + BATCH)) {
        try {
          const changed = await ctx.db.withTransaction((tx) =>
            this.reputation.reconcileUser(tx, userId, ctx.now),
          );
          if (changed) drift += 1;
        } catch (error) {
          failed += 1;
          // Solo el tipo de error: el mensaje podría traer datos personales.
          this.logger.error(
            `reputation.reconcile falló para una persona: ${error instanceof Error ? error.name : 'error'}.`,
          );
        }
      }
    }
    if (drift > 0) {
      await this.runs.addWarning(this.name, ctx.now, `drift: ${drift}`);
    }
    if (failed > 0) throw new Error(`reputation.reconcile no pudo procesar ${failed} persona(s).`);
    return userIds.length;
  }
}
