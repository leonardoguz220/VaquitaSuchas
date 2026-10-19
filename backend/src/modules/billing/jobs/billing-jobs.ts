import { Logger } from '@nestjs/common';
import type { DbService } from '../../../shared/db/db.service.js';
import type { JobRunsRepository } from '../../../shared/jobs/job-runs.repository.js';
import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import type { BillingCyclesService } from '../services/billing-cycles.service.js';
import type { OverdueService } from '../services/overdue.service.js';
import type { RetentionService } from '../services/retention.service.js';

/**
 * `billing.generate` (spec 002, research R1, RF-002-01, CA-002-22). En cada tick evalúa el estado
 * esperado de cada grupo activo y no congelado, no el reloj: así se recupera sola tras una caída.
 * Cada grupo va en su transacción con `pg_try_advisory_xact_lock` por grupo; si otra ejecución (o
 * la spec 010) lo tiene, se omite sin esperar. Un grupo que falla no impide los demás: al final
 * la tarea queda en `error` con la cuenta de fallos. Devuelve cuántos ciclos creó.
 */
export class BillingGenerateJob implements ScheduledJob {
  readonly name = 'billing.generate';
  readonly intervalSeconds = 0;
  private readonly logger = new Logger(BillingGenerateJob.name);

  constructor(
    private readonly groups: GroupsRepository,
    private readonly cycles: BillingCyclesService,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
  ) {}

  async run(ctx: JobContext): Promise<number> {
    const groupIds = await this.groups.listActiveUnfrozenIds(ctx.db);
    let created = 0;
    let failed = 0;
    const gaps: string[] = [];

    for (const groupId of groupIds) {
      try {
        const result = await ctx.db.withTransaction(async (tx) => {
          if (!(await this.db.tryAdvisoryLock(tx, `billing.generate:${groupId}`))) return null;
          return this.cycles.ensureCurrentCycle(tx, groupId, ctx.now);
        });
        if (!result) continue;
        created += 1;
        if (result.missedPeriods > 0) gaps.push(`${groupId} (${result.missedPeriods})`);
      } catch (error) {
        failed += 1;
        // Solo el id del grupo y el tipo de error: el mensaje puede traer datos personales.
        this.logger.error(
          `billing.generate falló en el grupo ${groupId}: ${error instanceof Error ? error.name : 'error'}.`,
        );
      }
    }

    if (gaps.length > 0) {
      // Caída de más de un período: se generó solo el más reciente (research R1).
      await this.runs.addWarning(
        this.name,
        ctx.now,
        `Advertencia: faltaron períodos en ${gaps.length} grupo(s) y solo se generó el más reciente: ${gaps.slice(0, 5).join(', ')}.`,
      );
    }
    if (failed > 0) {
      throw new Error(`billing.generate no pudo procesar ${failed} grupo(s).`);
    }
    return created;
  }
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

/**
 * `billing.retention` (RN-002-06, CA-002-33): una vez al día borra los archivos de comprobantes de
 * los grupos cerrados hace más de 2 meses. Devuelve cuántos archivos borró. Si alguno falla, el
 * resto igual se procesa y la ejecución queda en `error` para que el siguiente tick reintente.
 */
export class BillingRetentionJob implements ScheduledJob {
  readonly name = 'billing.retention';
  readonly intervalSeconds = ONE_DAY_SECONDS;

  constructor(private readonly retention: RetentionService) {}

  async run(ctx: JobContext): Promise<number> {
    const { deleted, failed } = await this.retention.purgeExpiredReceipts(ctx.now);
    if (failed > 0) {
      throw new Error(`billing.retention no pudo borrar ${failed} archivo(s).`);
    }
    return deleted;
  }
}

/**
 * `billing.overdue` (spec 002, RF-002-14, research R2): en cada tick marca `atrasado` los cobros
 * `pendiente` vencidos de grupos activos y no congelados y retira a su dueño por mora. Es
 * idempotente: decide por el estado de la base, no por el reloj. Devuelve cuántos cobros marcó.
 */
export class BillingOverdueJob implements ScheduledJob {
  readonly name = 'billing.overdue';
  readonly intervalSeconds = 0;

  constructor(private readonly overdue: OverdueService) {}

  run(ctx: JobContext): Promise<number> {
    return this.overdue.sweep(ctx.now);
  }
}
