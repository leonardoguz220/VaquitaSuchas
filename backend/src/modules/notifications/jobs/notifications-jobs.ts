import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { DeliveryService } from '../services/delivery.service.js';
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

  constructor(private readonly delivery: DeliveryService) {}

  run(ctx: JobContext): Promise<number> {
    return this.delivery.deliver(ctx.now);
  }
}
