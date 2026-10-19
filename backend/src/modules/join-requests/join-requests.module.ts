import { Module, type OnModuleInit } from '@nestjs/common';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
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
import { JoinRequestsRetentionJob, JoinRequestsSweepJob } from './jobs/join-requests-jobs.js';
import { DisputesRepository } from './repositories/disputes.repository.js';
import { RequestEventsRepository } from './repositories/events.repository.js';
import { MessagesRepository } from './repositories/messages.repository.js';
import { RequestsRepository } from './repositories/requests.repository.js';
import { ChatService } from './services/chat.service.js';
import { EntryPaymentService } from './services/entry-payment.service.js';
import { GroupEventsHandlers } from './services/group-events.handlers.js';
import { JoinRequestsService } from './services/join-requests.service.js';
import { ReservedSlotsQuery } from './services/reserved-slots.query.js';
import { JoinRetentionService } from './services/retention.service.js';
import { RequestLifecycle } from './services/request-lifecycle.js';
import { RequestSweeper } from './services/request-sweeper.js';
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
    JoinRetentionService,
    GroupEventsHandlers,
    ReservedSlotsQuery,
  ],
  exports: [
    JoinRequestsService,
    EntryPaymentService,
    ChatService,
    RequestLifecycle,
    ReservedSlotsQuery,
  ],
})
export class JoinRequestsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly registry: JobRegistry,
    private readonly sweeper: RequestSweeper,
    private readonly retention: JoinRetentionService,
    private readonly groupEvents: GroupEventsHandlers,
  ) {}

  onModuleInit(): void {
    this.groupEvents.register(this.bus);
    this.registry.register(new JoinRequestsSweepJob(this.sweeper));
    this.registry.register(new JoinRequestsRetentionJob(this.retention));
  }
}
