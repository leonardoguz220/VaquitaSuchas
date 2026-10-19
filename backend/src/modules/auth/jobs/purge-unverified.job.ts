import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { UnverifiedUsersRepository } from '../repositories/unverified-users.repository.js';

export const UNVERIFIED_TTL_MS = 24 * 3600_000;

/** Borra cuentas sin verificar con más de 24 h (RF-003-04). Idempotente. */
export class PurgeUnverifiedJob implements ScheduledJob {
  readonly name = 'auth.purge_unverified';
  readonly intervalSeconds = 3600;

  constructor(private readonly repository: UnverifiedUsersRepository) {}

  run(ctx: JobContext): Promise<number> {
    return this.repository.deleteCreatedBefore(new Date(ctx.now.getTime() - UNVERIFIED_TTL_MS));
  }
}
