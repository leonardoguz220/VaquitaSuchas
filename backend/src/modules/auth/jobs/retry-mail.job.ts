import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { MailOutbox } from '../services/mail-outbox.js';

/** Reintenta los correos de la cuenta que fallaron (hasta 3 intentos en total). Idempotente. */
export class RetryMailJob implements ScheduledJob {
  readonly name = 'auth.retry_mail';
  readonly intervalSeconds = 60;

  constructor(private readonly outbox: MailOutbox) {}

  run(_ctx: JobContext): Promise<number> {
    return this.outbox.retryPending();
  }
}
