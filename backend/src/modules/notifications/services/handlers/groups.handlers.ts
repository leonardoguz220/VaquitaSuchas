import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../../shared/db/db.service.js';
import type {
  GroupClosed,
  GroupFrozen,
  MemberAdded,
  MemberRemoved,
  OwnerChanged,
} from '../../../../shared/events/group-events.js';
import type { UserSuspended } from '../../../../shared/events/user-events.js';
import type { NotificationType } from '../../domain/catalog.js';
import { NotificationFactsRepository } from '../../repositories/notification-facts.repository.js';
import { NotificationService } from '../notification.service.js';

/**
 * Avisos de grupos y membresías (spec 005, T009). Las altas y bajas se repiten en el tiempo
 * (alguien puede salir y volver), así que el instante del hecho distingue una de otra.
 */
@Injectable()
export class GroupNotificationHandlers {
  constructor(
    private readonly notifications: NotificationService,
    private readonly facts: NotificationFactsRepository,
    private readonly clock: Clock,
  ) {}

  async onMemberAdded(tx: DbTransaction, event: MemberAdded): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group || group.ownerId === event.userId) return;
    await this.notifications.notify(tx, {
      userId: group.ownerId,
      type: 'miembro_se_une',
      entity: { type: 'group_member', id: event.userId },
      period: this.clock.now().toISOString(),
      data: {
        groupId: event.groupId,
        groupName: group.name,
        personName: await this.facts.userName(tx, event.userId),
      },
    });
  }

  /** `abandono` avisa al titular; `quitado` y `baneo` a la persona retirada; `mora` lo cubre billing. */
  async onMemberRemoved(tx: DbTransaction, event: MemberRemoved): Promise<void> {
    if (event.reason === 'mora') return;
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    const period = this.clock.now().toISOString();
    const entity = { type: 'group_member', id: event.userId };
    if (event.reason === 'abandono') {
      await this.notifications.notify(tx, {
        userId: group.ownerId,
        type: 'miembro_abandona',
        entity,
        period,
        data: {
          groupId: event.groupId,
          groupName: group.name,
          personName: await this.facts.userName(tx, event.userId),
        },
      });
      return;
    }
    await this.notifications.notify(tx, {
      userId: event.userId,
      type: 'miembro_quitado',
      entity,
      period,
      data: { groupId: event.groupId, groupName: group.name },
    });
  }

  async onOwnerChanged(tx: DbTransaction, event: OwnerChanged): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    const newOwnerName = await this.facts.userName(tx, event.newOwnerId);
    const members = (await this.facts.memberIds(tx, event.groupId)).concat(event.previousOwnerId);
    for (const userId of members) {
      if (userId === event.newOwnerId) continue;
      await this.notifications.notify(tx, {
        userId,
        type: 'titularidad_cambiada',
        entity: { type: 'group', id: event.groupId },
        period: this.clock.now().toISOString(),
        data: { groupId: event.groupId, groupName: group.name, personName: newOwnerName },
      });
    }
  }

  async onGroupClosed(tx: DbTransaction, event: GroupClosed): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    await this.toMembers(tx, event.groupId, 'grupo_cerrado', group.name);
  }

  /** Baneo del titular: sus grupos quedan congelados (RF-005-12). */
  async onGroupFrozen(tx: DbTransaction, event: GroupFrozen): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    await this.toMembers(tx, event.groupId, 'titular_baneado', group.name);
  }

  /** Suspensión del titular: avisa a los miembros de cada grupo activo que posee. */
  async onUserSuspended(tx: DbTransaction, event: UserSuspended): Promise<void> {
    for (const groupId of await this.facts.ownedActiveGroupIds(tx, event.userId)) {
      const group = await this.facts.group(tx, groupId);
      if (group) await this.toMembers(tx, groupId, 'titular_suspendido', group.name);
    }
  }

  private async toMembers(
    tx: DbTransaction,
    groupId: string,
    type: NotificationType,
    groupName: string,
  ): Promise<void> {
    const period = this.clock.now().toISOString();
    for (const userId of await this.facts.memberIds(tx, groupId)) {
      await this.notifications.notify(tx, {
        userId,
        type,
        entity: { type: 'group', id: groupId },
        period,
        data: { groupId, groupName },
      });
    }
  }
}
