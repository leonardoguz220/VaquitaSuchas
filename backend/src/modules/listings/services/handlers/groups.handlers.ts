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
import type { UserBanned } from '../../../../shared/events/user-events.js';
import { NotificationService } from '../../../notifications/services/notification.service.js';
import { ListingsRepository } from '../../repositories/listings.repository.js';
import { ListingsExpireService } from '../listings-expire.service.js';

/**
 * Manejadores de eventos de grupos y cuentas sobre la publicación (spec 008 US5). Corren en la
 * transacción del hecho; bloquean grupo → publicación y reutilizan `reconcile`, así que repetir
 * un evento no cambia nada. `UserSuspended`/`UserReactivated` no hacen falta: la búsqueda filtra
 * por el estado de la cuenta del titular (contrato 008), sin tocar la publicación.
 */
@Injectable()
export class ListingsGroupHandlers {
  constructor(
    private readonly clock: Clock,
    private readonly listings: ListingsRepository,
    private readonly expire: ListingsExpireService,
    private readonly notifications: NotificationService,
  ) {}

  /** `MemberAdded` / `MemberRemoved`: ajusta los cupos a los libres o cierra por grupo lleno. */
  onMembershipChanged(tx: DbTransaction, event: MemberAdded | MemberRemoved): Promise<void> {
    return this.reconcileGroup(tx, event.groupId);
  }

  /** `GroupClosed` (CA-008-16) y `GroupFrozen`: la publicación se cierra. */
  onGroupClosed(tx: DbTransaction, event: GroupClosed | GroupFrozen): Promise<void> {
    return this.reconcileGroup(tx, event.groupId);
  }

  /** `UserBanned` del titular: sus publicaciones se cierran por `grupo_congelado`. */
  async onUserBanned(tx: DbTransaction, event: UserBanned): Promise<void> {
    for (const { groupId } of await this.listings.listLiveByOwner(tx, event.userId)) {
      await this.reconcileGroup(tx, groupId);
    }
  }

  /** `OwnerChanged`: la publicación sigue y se avisa a la nueva persona titular. */
  async onOwnerChanged(tx: DbTransaction, event: OwnerChanged): Promise<void> {
    const group = await this.listings.lockGroup(tx, event.groupId);
    if (!group) return;
    const listing = await this.listings.findLiveByGroup(tx, event.groupId, true);
    if (!listing) return;
    await this.notifications.notify(tx, {
      userId: event.newOwnerId,
      type: 'publicacion_transferida',
      entity: { type: 'listing', id: listing.id },
      period: this.clock.now().toISOString(),
      data: {
        groupId: group.id,
        groupName: (await this.listings.groupName(tx, group.id)) ?? '',
      },
    });
  }

  private async reconcileGroup(tx: DbTransaction, groupId: string): Promise<void> {
    const group = await this.listings.lockGroup(tx, groupId);
    if (!group) return;
    const listing = await this.listings.findLiveByGroup(tx, groupId, true);
    if (!listing) return;
    await this.expire.reconcile(tx, group, listing, this.clock.now());
  }
}
