import { Module, type OnModuleInit } from '@nestjs/common';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import type { GroupClosed } from '../../shared/events/group-events.js';
import type { UserBanned, UserSuspended } from '../../shared/events/user-events.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { RateLimitRepository } from '../auth/repositories/rate-limit.repository.js';
import { ChatController } from './controllers/chat.controller.js';
import {
  HostRequestsController,
  JoinRequestsController,
} from './controllers/join-requests.controller.js';
import { DisputesRepository } from './repositories/disputes.repository.js';
import { RequestEventsRepository } from './repositories/events.repository.js';
import { MessagesRepository } from './repositories/messages.repository.js';
import { RequestsRepository } from './repositories/requests.repository.js';
import { JoinRequestsRetentionJob, JoinRequestsSweepJob } from './jobs/join-requests-jobs.js';
import { RESERVED_SLOTS_QUERY } from './ports/reserved-slots.query.js';
import { ChatService } from './services/chat.service.js';
import { EntryPaymentService } from './services/entry-payment.service.js';
import { GroupEventsHandlers } from './services/group-events.handlers.js';
import { JoinRequestsService } from './services/join-requests.service.js';
import { RequestLifecycle } from './services/request-lifecycle.js';
import { RequestSweeper } from './services/request-sweeper.js';
import { ReservedSlotsAdapter } from './services/reserved-slots.adapter.js';
import { JoinRequestsRetentionService } from './services/retention.service.js';
import { RequestViewService } from './services/request-view.service.js';

// DbService, Clock, TxEventBus y FileStorage llegan de módulos globales; los puertos de baneo,
// auditoría y calificación (adaptadores nulos hasta las specs 009 y 007), de `AdaptersModule`.
@Module({
  imports: [SubscriptionsModule, AuthModule, BillingModule, AdaptersModule],
  controllers: [JoinRequestsController, HostRequestsController, ChatController],
  providers: [
    RateLimitRepository,
    RequestsRepository,
    RequestEventsRepository,
    MessagesRepository,
    DisputesRepository,
    RequestLifecycle,
    RequestViewService,
    JoinRequestsService,
    EntryPaymentService,
    ChatService,
    RequestSweeper,
    JoinRequestsRetentionService,
    GroupEventsHandlers,
    ReservedSlotsAdapter,
    { provide: RESERVED_SLOTS_QUERY, useExisting: ReservedSlotsAdapter },
  ],
  exports: [
    JoinRequestsService,
    EntryPaymentService,
    ChatService,
    RequestLifecycle,
    RESERVED_SLOTS_QUERY,
  ],
})
export class JoinRequestsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly registry: JobRegistry,
    private readonly sweeper: RequestSweeper,
    private readonly retention: JoinRequestsRetentionService,
    private readonly groupEvents: GroupEventsHandlers,
  ) {}

  onModuleInit(): void {
    this.bus.register<GroupClosed>('groups.closed', (tx, event) =>
      this.groupEvents.onGroupClosed(tx, event),
    );
    this.bus.register<UserBanned>('users.banned', (tx, event) =>
      this.groupEvents.onUserBanned(tx, event),
    );
    this.bus.register<UserSuspended>('users.suspended', (tx, event) =>
      this.groupEvents.onUserSuspended(tx, event),
    );
    this.registry.register(new JoinRequestsSweepJob(this.sweeper));
    this.registry.register(new JoinRequestsRetentionJob(this.retention));
  }
}
