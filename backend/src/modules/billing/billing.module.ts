import { Module, type OnModuleInit } from '@nestjs/common';
import type { GroupCreated, MemberAdded, MemberRemoved } from '../../shared/events/group-events.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import { DbService } from '../../shared/db/db.service.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { JobRunsRepository } from '../../shared/jobs/job-runs.repository.js';
import { GroupsRepository } from '../subscriptions/repositories/groups.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { ChargesController } from './controllers/charges.controller.js';
import { GroupBillingController } from './controllers/group-billing.controller.js';
import { ReceiptsController } from './controllers/receipts.controller.js';
import { CHARGE_FACTS_PORT } from './ports/charge-facts.port.js';
import { BillingGenerateJob, BillingOverdueJob, BillingRetentionJob } from './jobs/billing-jobs.js';
import { ChargeFactsRepository } from './repositories/charge-facts.repository.js';
import { ChargeReadRepository } from './repositories/charge-read.repository.js';
import { ChargesRepository } from './repositories/charges.repository.js';
import { CyclesRepository } from './repositories/cycles.repository.js';
import { ChargeEventsRepository } from './repositories/events.repository.js';
import { PaymentReferencesRepository } from './repositories/payment-references.repository.js';
import { ReceiptsRepository } from './repositories/receipts.repository.js';
import { BillingCyclesService } from './services/billing-cycles.service.js';
import { BillingReadService } from './services/billing-read.service.js';
import { ChargesService } from './services/charges.service.js';
import { ChargeAccessService } from './services/charge-access.service.js';
import { GroupBillingService } from './services/group-billing.service.js';
import { OverdueService } from './services/overdue.service.js';
import { PaymentReferenceService } from './services/payment-reference.service.js';
import { ReceiptsService } from './services/receipts.service.js';
import { RetentionService } from './services/retention.service.js';

// DbService, Clock, TxEventBus, JobRegistry, JobRunsRepository y FileStorage llegan de módulos globales.
@Module({
  imports: [SubscriptionsModule, AuthModule],
  controllers: [ChargesController, ReceiptsController, GroupBillingController],
  providers: [
    CyclesRepository,
    ChargesRepository,
    ChargeEventsRepository,
    ReceiptsRepository,
    PaymentReferencesRepository,
    ChargeReadRepository,
    ChargeFactsRepository,
    { provide: CHARGE_FACTS_PORT, useExisting: ChargeFactsRepository },
    BillingCyclesService,
    ChargeAccessService,
    BillingReadService,
    PaymentReferenceService,
    ReceiptsService,
    ChargesService,
    GroupBillingService,
    OverdueService,
    RetentionService,
  ],
  exports: [
    BillingCyclesService,
    BillingReadService,
    ChargesService,
    OverdueService,
    PaymentReferenceService,
    CHARGE_FACTS_PORT,
  ],
})
export class BillingModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly registry: JobRegistry,
    private readonly cycles: BillingCyclesService,
    private readonly groups: GroupsRepository,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
    private readonly retention: RetentionService,
    private readonly overdue: OverdueService,
  ) {}

  onModuleInit(): void {
    this.bus.register<GroupCreated>('groups.created', (tx, event) =>
      this.cycles.onGroupCreated(tx, event),
    );
    this.bus.register<MemberAdded>('groups.member-added', (tx, event) =>
      this.cycles.onMemberAdded(tx, event),
    );
    this.bus.register<MemberRemoved>('groups.member-removed', (tx, event) =>
      this.cycles.onMemberRemoved(tx, event),
    );
    this.registry.register(new BillingGenerateJob(this.groups, this.cycles, this.runs, this.db));
    this.registry.register(new BillingOverdueJob(this.overdue));
    this.registry.register(new BillingRetentionJob(this.retention));
  }
}
