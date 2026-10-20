import { Module, type OnModuleInit } from '@nestjs/common';
import { DbService } from '../../shared/db/db.service.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { JobRunsRepository } from '../../shared/jobs/job-runs.repository.js';
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
import { ReportsController } from './controllers/reports.controller.js';
import { BadgesController } from './controllers/badges.controller.js';
import { RankingController } from './controllers/ranking.controller.js';
import { ReputationController } from './controllers/reputation.controller.js';
import { REPUTATION_RATINGS_PORT } from './ports/reputation-query.port.js';
import { ReputationRepository } from './repositories/reputation.repository.js';
import { BadgesRepository } from './repositories/badges.repository.js';
import { BadgesService } from './services/badges.service.js';
import { ExclusionsRepository } from './repositories/exclusions.repository.js';
import { ReportsService } from './services/reports.service.js';
import { RankingService } from './services/ranking.service.js';
import { ReputationReconcileJob } from './services/reconcile.job.js';
import { ReputationEventsHandler } from './services/reputation-events.handler.js';
import { ReputationQueryService } from './services/reputation-query.service.js';
import { ReputationService } from './services/reputation.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales. `ChargeFactsPort` lo exporta billing.
@Module({
  imports: [BillingModule, AuthModule],
  controllers: [ReputationController, RankingController, BadgesController, ReportsController],
  providers: [
    ReputationRepository,
    BadgesRepository,
    BadgesService,
    ExclusionsRepository,
    ReportsService,
    ReputationService,
    ReputationQueryService,
    ReputationEventsHandler,
    RankingService,
    { provide: REPUTATION_RATINGS_PORT, useExisting: ReputationQueryService },
  ],
  exports: [ReputationService, ReputationQueryService, REPUTATION_RATINGS_PORT],
})
export class ReputationModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly handler: ReputationEventsHandler,
    private readonly registry: JobRegistry,
    private readonly repository: ReputationRepository,
    private readonly reputation: ReputationService,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
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
    this.registry.register(
      new ReputationReconcileJob(this.repository, this.reputation, this.runs, this.db),
    );
  }
}
