import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { JoinRetentionService } from '../services/retention.service.js';
import type { RequestSweeper } from '../services/request-sweeper.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;

/** `join-requests.sweep` (RNF-010-03): en cada tick persiste vencimientos y envía recordatorios. */
export class JoinRequestsSweepJob implements ScheduledJob {
  readonly name = 'join-requests.sweep';
  readonly intervalSeconds = 0;

  constructor(private readonly sweeper: RequestSweeper) {}

  run(ctx: JobContext): Promise<number> {
    return this.sweeper.sweep(ctx.now);
  }
}

/** `join-requests.retention` (RNF-010-09): una vez al día purga chat, imágenes y comprobantes. */
export class JoinRequestsRetentionJob implements ScheduledJob {
  readonly name = 'join-requests.retention';
  readonly intervalSeconds = ONE_DAY_SECONDS;

  constructor(private readonly retention: JoinRetentionService) {}

  async run(ctx: JobContext): Promise<number> {
    const { purged, failed } = await this.retention.purgeExpired(ctx.now);
    if (failed > 0)
      throw new Error(`join-requests.retention no pudo limpiar ${failed} elemento(s).`);
    return purged;
  }
}
