import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import type { GroupFrozen } from '../../../shared/events/group-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { UserBanned, UserUnbanned } from '../../../shared/events/user-events.js';
import { GroupsRepository } from '../repositories/groups.repository.js';
import { MembersRepository } from '../repositories/members.repository.js';
import { MembershipService } from './membership.service.js';

/**
 * Reacciona a los eventos de cuenta de la spec 009 (RF-001-23, RN-001-07). Corre dentro de la
 * transacción del baneo o de su reversión (TxEventBus): si algo falla, se revierte todo.
 * El grupo se congela, no se transfiere: el titular baneado sigue como titular.
 */
@Injectable()
export class UserEventsHandler {
  constructor(
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly membership: MembershipService,
    private readonly clock: Clock,
  ) {}

  /** Congela los grupos que posee y lo retira (`baneo`) de aquellos donde solo es miembro. */
  async onUserBanned(tx: DbTransaction, event: UserBanned): Promise<void> {
    const now = this.clock.now();
    for (const groupId of await this.groups.listOwnedIds(tx, event.userId)) {
      // Bloqueo del grupo y UPDATE condicional: repetir el evento no cambia nada.
      await this.groups.findByIdForUpdate(tx, groupId);
      if (await this.groups.freezeForBan(tx, groupId, now)) {
        const frozen: GroupFrozen = { type: 'groups.frozen', groupId };
        await this.bus.publish(tx, frozen);
      }
    }
    for (const groupId of await this.members.listNonOwnerGroupIds(tx, event.userId)) {
      await this.membership.removeMemberTx(tx, groupId, event.userId, 'baneo');
    }
  }

  /** Descongela solo los grupos que congeló el baneo; no restituye pertenencias. */
  async onUserUnbanned(tx: DbTransaction, event: UserUnbanned): Promise<void> {
    for (const groupId of await this.groups.listFrozenByBanIds(tx, event.userId)) {
      await this.groups.findByIdForUpdate(tx, groupId);
      await this.groups.unfreezeForBan(tx, groupId);
    }
  }
}
