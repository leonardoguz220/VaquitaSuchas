import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { DeliveryService } from '../services/delivery.service.js';
import type { InvitationsService } from '../services/invitations.service.js';
import type { PurgeService } from '../services/purge.service.js';
import type { ScheduleService } from '../services/schedule.service.js';

/** `notifications.schedule` (spec 005, RF-005-19): en cada tick; la parte diaria se decide dentro. */
export class NotificationsScheduleJob implements ScheduledJob {
  readonly name = 'notifications.schedule';
  readonly intervalSeconds = 0;

  constructor(private readonly schedule: ScheduleService) {}

  run(ctx: JobContext): Promise<number> {
    return this.schedule.run(ctx.now);
  }
}

/** `notifications.deliver` (spec 005, RF-005-19, RF-005-20): envía los correos pendientes. */
export class NotificationsDeliverJob implements ScheduledJob {
  readonly name = 'notifications.deliver';
  readonly intervalSeconds = 0;

  constructor(
    private readonly delivery: DeliveryService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Envía los correos de avisos y los de invitaciones (RF-005-14), ambos con reintentos. */
  async run(ctx: JobContext): Promise<number> {
    const notices = await this.delivery.deliver(ctx.now);
    return notices + (await this.invitations.deliverDue(ctx.now));
  }
}

/** `notifications.purge` (spec 005, RF-005-21): limpieza diaria de avisos e invitaciones viejos. */
export class NotificationsPurgeJob implements ScheduledJob {
  readonly name = 'notifications.purge';
  readonly intervalSeconds = 24 * 60 * 60;

  constructor(private readonly purge: PurgeService) {}

  run(ctx: JobContext): Promise<number> {
    return this.purge.run(ctx.now);
  }
}
