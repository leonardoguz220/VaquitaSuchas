import { Module, type OnModuleInit } from '@nestjs/common';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { GroupMemberGuard } from './controllers/group-member.guard.js';
import { GroupOwnerGuard } from './controllers/group-owner.guard.js';
import {
  GroupAdminController,
  GroupsController,
  LeaveController,
  MembersController,
} from './controllers/groups.controller.js';
import { GroupsRepository } from './repositories/groups.repository.js';
import { MembersRepository } from './repositories/members.repository.js';
import { TxEventBus } from '../../shared/events/tx-event-bus.js';
import type { UserBanned, UserUnbanned } from '../../shared/events/user-events.js';
import { GroupsService } from './services/groups.service.js';
import { MembershipService } from './services/membership.service.js';
import { UserEventsHandler } from './services/user-events.handler.js';

// DbService, Clock y TxEventBus llegan de módulos globales. Los puertos (cobros abiertos,
// elegibilidad, bloqueos) los aportan los adaptadores de `app-adapters/` (también registrados
// en AppModule) y otras specs.
@Module({
  imports: [AuthModule, CatalogModule, AdaptersModule],
  controllers: [GroupsController, GroupAdminController, MembersController, LeaveController],
  providers: [
    GroupsRepository,
    MembersRepository,
    GroupsService,
    MembershipService,
    UserEventsHandler,
    GroupMemberGuard,
    GroupOwnerGuard,
  ],
  exports: [
    GroupsRepository,
    MembersRepository,
    GroupsService,
    MembershipService,
    GroupMemberGuard,
    GroupOwnerGuard,
  ],
})
export class SubscriptionsModule implements OnModuleInit {
  constructor(
    private readonly bus: TxEventBus,
    private readonly userEvents: UserEventsHandler,
  ) {}

  // `UserSuspended` no se registra: no toca el grupo (RN-009-03).
  onModuleInit(): void {
    this.bus.register<UserBanned>('users.banned', (tx, event) =>
      this.userEvents.onUserBanned(tx, event),
    );
    this.bus.register<UserUnbanned>('users.unbanned', (tx, event) =>
      this.userEvents.onUserUnbanned(tx, event),
    );
  }
}
