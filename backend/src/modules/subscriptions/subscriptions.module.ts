import { Module } from '@nestjs/common';
import { AdaptersModule } from '../../app-adapters/adapters.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { GroupMemberGuard } from './controllers/group-member.guard.js';
import { GroupOwnerGuard } from './controllers/group-owner.guard.js';
import { GroupsController, MembersController } from './controllers/groups.controller.js';
import { GroupsRepository } from './repositories/groups.repository.js';
import { MembersRepository } from './repositories/members.repository.js';
import { GroupsService } from './services/groups.service.js';
import { MembershipService } from './services/membership.service.js';

// DbService, Clock y TxEventBus llegan de módulos globales. Los puertos (cobros abiertos,
// elegibilidad, bloqueos) los aportan los adaptadores de `app-adapters/` (también registrados
// en AppModule) y otras specs.
@Module({
  imports: [AuthModule, CatalogModule, AdaptersModule],
  controllers: [GroupsController, MembersController],
  providers: [
    GroupsRepository,
    MembersRepository,
    GroupsService,
    MembershipService,
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
export class SubscriptionsModule {}
