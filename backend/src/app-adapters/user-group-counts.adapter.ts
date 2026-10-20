import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type {
  UserGroupCounts,
  UserGroupCountsPort,
} from '../modules/admin/ports/user-group-counts.port.js';
import { GroupsRepository } from '../modules/subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../modules/subscriptions/repositories/members.repository.js';

/** Conteos de grupos de la ficha de administración con los repositorios de `subscriptions`. */
@Injectable()
export class UserGroupCountsAdapter implements UserGroupCountsPort {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
  ) {}

  async count(q: Queryable, userId: string): Promise<UserGroupCounts> {
    return {
      asHost: await this.groups.countOwnedActive(q, userId),
      asMember: await this.members.countMemberActive(q, userId),
    };
  }
}
