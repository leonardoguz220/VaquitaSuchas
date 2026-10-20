import { Module, type OnModuleInit } from '@nestjs/common';
import type {
  ChargeBecameOverdue,
  ChargeCancelled,
  ChargeConfirmed,
} from '../../shared/events/charge-events.js';
import type { GroupFrozen } from '../../shared/events/group-events.js';
import type { UserBanned } from '../../shared/events/user-events.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { ReputationController } from './controllers/reputation.controller.js';
import { REPUTATION_RATINGS_PORT } from './ports/reputation-query.port.js';
import { ReputationRepository } from './repositories/reputation.repository.js';
import { ReputationEventsHandler } from './services/reputation-events.handler.js';
import { ReputationQueryService } from './services/reputation-query.service.js';
import { ReputationService } from './services/reputation.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales. `ChargeFactsPort` lo exporta billing.
@Module({
  imports: [BillingModule, AuthModule],
  controllers: [ReputationController],
  providers: [
    ReputationRepository,
    ReputationService,
    ReputationQueryService,
    ReputationEventsHandler,
    { provide: REPUTATION_RATINGS_PORT, useExisting: ReputationQueryService },
  ],
  exports: [ReputationService, ReputationQueryService, REPUTATION_RATINGS_PORT],
})
export class ReputationModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly handler: ReputationEventsHandler,
  ) {}

  onModuleInit(): void {
    this.bus.register<ChargeConfirmed>('billing.charge-confirmed', (tx, e) =>
      this.handler.onChargeChanged(tx, e),
    );
    this.bus.register<ChargeBecameOverdue>('billing.charge-became-overdue', (tx, e) =>
      this.handler.onChargeChanged(tx, e),
    );
    this.bus.register<ChargeCancelled>('billing.charge-cancelled', (tx, e) =>
      this.handler.onChargeChanged(tx, e),
    );
    this.bus.register<GroupFrozen>('groups.frozen', (tx, e) => this.handler.onGroupFrozen(tx, e));
    this.bus.register<UserBanned>('users.banned', (tx, e) => this.handler.onUserBanned(tx, e));
  }
}
