import { Module } from '@nestjs/common';
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
import { ChatService } from './services/chat.service.js';
import { EntryPaymentService } from './services/entry-payment.service.js';
import { JoinRequestsService } from './services/join-requests.service.js';
import { RequestLifecycle } from './services/request-lifecycle.js';
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
  ],
  exports: [JoinRequestsService, EntryPaymentService, ChatService, RequestLifecycle],
})
export class JoinRequestsModule {}
