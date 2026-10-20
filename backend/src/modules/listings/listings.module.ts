import { Module, type OnModuleInit } from '@nestjs/common';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import type {
  GroupClosed,
  GroupFrozen,
  MemberAdded,
  MemberRemoved,
  OwnerChanged,
} from '../../shared/events/group-events.js';
import type { JoinRequestAccepted } from '../../shared/events/join-request-events.js';
import type { UserBanned } from '../../shared/events/user-events.js';
import { JobRegistry } from '../../shared/jobs/job-registry.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { JoinRequestsModule } from '../join-requests/join-requests.module.js';
import { GroupListingController } from './controllers/group-listing.controller.js';
import { ListingsController } from './controllers/listings.controller.js';
import { ListingReportsRepository } from './repositories/listing-reports.repository.js';
import { ListingsRepository } from './repositories/listings.repository.js';
import { ListingsSearchRepository } from './repositories/listings-search.repository.js';
import { ListingsGroupHandlers } from './services/handlers/groups.handlers.js';
import { ListingsExpireJob, ListingsExpireService } from './services/listings-expire.service.js';
import { ListingReportsService } from './services/listing-reports.service.js';
import { ListingsSearchService } from './services/listings-search.service.js';
import { ListingsService } from './services/listings.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales; el puerto de calificación, de
// `AdaptersModule`. `listings` depende de `join-requests` (abrir y rechazar solicitudes); la
// dirección contraria pasa por `ListingQuotaPort` en `app-adapters/`, sin ciclos.
@Module({
  imports: [AuthModule, NotificationsModule, AdaptersModule, JoinRequestsModule],
  controllers: [ListingsController, GroupListingController],
  providers: [
    ListingsRepository,
    ListingReportsRepository,
    ListingsSearchRepository,
    ListingsSearchService,
    ListingsService,
    ListingReportsService,
    ListingsExpireService,
    ListingsGroupHandlers,
  ],
  exports: [ListingsRepository, ListingsSearchService, ListingsService],
})
export class ListingsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly service: ListingsService,
    private readonly registry: JobRegistry,
    private readonly expire: ListingsExpireService,
    private readonly groupHandlers: ListingsGroupHandlers,
  ) {}

  onModuleInit(): void {
    this.bus.register<JoinRequestAccepted>('join-requests.accepted', (tx, event) =>
      this.service.onRequestAccepted(tx, event),
    );
    this.bus.register<MemberAdded>('groups.member-added', (tx, event) =>
      this.groupHandlers.onMembershipChanged(tx, event),
    );
    this.bus.register<MemberRemoved>('groups.member-removed', (tx, event) =>
      this.groupHandlers.onMembershipChanged(tx, event),
    );
    this.bus.register<GroupClosed>('groups.closed', (tx, event) =>
      this.groupHandlers.onGroupClosed(tx, event),
    );
    this.bus.register<GroupFrozen>('groups.frozen', (tx, event) =>
      this.groupHandlers.onGroupClosed(tx, event),
    );
    this.bus.register<OwnerChanged>('groups.owner-changed', (tx, event) =>
      this.groupHandlers.onOwnerChanged(tx, event),
    );
    this.bus.register<UserBanned>('users.banned', (tx, event) =>
      this.groupHandlers.onUserBanned(tx, event),
    );
    this.registry.register(new ListingsExpireJob(this.expire));
  }
}
