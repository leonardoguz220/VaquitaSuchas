import { Module, type OnModuleInit } from '@nestjs/common';
import type { GroupCreated, MemberAdded, MemberRemoved } from '../../shared/events/group-events.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import { DbService } from '../../shared/db/db.service.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { JobRunsRepository } from '../../shared/jobs/job-runs.repository.js';
import { GroupsRepository } from '../subscriptions/repositories/groups.repository.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { BillingGenerateJob } from './jobs/billing-jobs.js';
import { ChargesRepository } from './repositories/charges.repository.js';
import { CyclesRepository } from './repositories/cycles.repository.js';
import { BillingCyclesService } from './services/billing-cycles.service.js';

// DbService, Clock, TxEventBus, JobRegistry y JobRunsRepository llegan de módulos globales.
@Module({
  imports: [SubscriptionsModule],
  providers: [CyclesRepository, ChargesRepository, BillingCyclesService],
  exports: [BillingCyclesService],
})
export class BillingModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly registry: JobRegistry,
    private readonly cycles: BillingCyclesService,
    private readonly groups: GroupsRepository,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
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
  }
}
