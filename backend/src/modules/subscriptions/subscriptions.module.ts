import { Module } from '@nestjs/common';
import { GroupMemberGuard } from './controllers/group-member.guard.js';
import { GroupOwnerGuard } from './controllers/group-owner.guard.js';
import { GroupsRepository } from './repositories/groups.repository.js';
import { MembersRepository } from './repositories/members.repository.js';

// DbService llega del módulo global. Los puertos (cobros abiertos, elegibilidad, bloqueos) los
// aportan billing, administración y solicitudes.
@Module({
  providers: [GroupsRepository, MembersRepository, GroupMemberGuard, GroupOwnerGuard],
  exports: [GroupsRepository, MembersRepository, GroupMemberGuard, GroupOwnerGuard],
})
export class SubscriptionsModule {}
