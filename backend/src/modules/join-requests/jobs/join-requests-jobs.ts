import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { JoinRequestsRetentionService } from '../services/retention.service.js';
import type { RequestSweeper } from '../services/request-sweeper.js';

/**
 * `join_requests.sweep` (spec 010, contracts/api.md): en cada tick persiste los vencimientos y
 * envía los recordatorios. Idempotente: decide por el estado de la base. Devuelve cuántas
 * solicitudes cambió o avisó; si alguna falló, la ejecución queda en `error` (las demás igual se procesan).
 */
export class JoinRequestsSweepJob implements ScheduledJob {
  readonly name = 'join_requests.sweep';
  readonly intervalSeconds = 0;

  constructor(private readonly sweeper: RequestSweeper) {}

  async run(ctx: JobContext): Promise<number> {
    const { expired, reminded, failed } = await this.sweeper.sweep(ctx.now);
    if (failed > 0)
      throw new Error(`join_requests.sweep no pudo procesar ${failed} solicitud(es).`);
    return expired + reminded;
  }
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

/** `join_requests.retention` (diaria, RNF-010-09, CA-010-44). Devuelve cuántas solicitudes limpió. */
export class JoinRequestsRetentionJob implements ScheduledJob {
  readonly name = 'join_requests.retention';
  readonly intervalSeconds = ONE_DAY_SECONDS;

  constructor(private readonly retention: JoinRequestsRetentionService) {}

  async run(ctx: JobContext): Promise<number> {
    const { purged, failed } = await this.retention.purgeExpiredContent(ctx.now);
    if (failed > 0) {
      throw new Error(`join_requests.retention no pudo limpiar ${failed} solicitud(es).`);
    }
    return purged;
  }
}
