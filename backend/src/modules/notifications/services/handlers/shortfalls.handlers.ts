import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../../shared/db/db.service.js';
import type {
  ShortfallClosed,
  ShortfallOpened,
  ShortfallPaymentConfirmed,
  ShortfallPaymentInformed,
  ShortfallPaymentRejected,
  ShortfallRefundOpened,
  ShortfallRefundResolved,
  ShortfallRefundSent,
} from '../../../../shared/events/shortfall-events.js';
import type { NotificationType } from '../../domain/catalog.js';
import type { NotificationData } from '../../domain/templates.js';
import { NotificationFactsRepository } from '../../repositories/notification-facts.repository.js';
import { NotificationService } from '../notification.service.js';

const ROW_ENTITY = 'shortfall_row';
const ROUND_ENTITY = 'shortfall_round';

interface RowRef {
  roundId: string;
  groupId: string;
  hostId: string;
  rowId: string;
  userId: string;
  rowVersion: number;
}

/**
 * Avisos del faltante de grupo (spec 005, RF-005-25; eventos de la spec 011). Los eventos no llevan
 * referencias de pago ni motivos escritos: el texto de Telegram nunca incluye montos (RF-005-27).
 * La clave de cada aviso lleva la versión de la fila, así una repetición legítima (un pago rechazado
 * y vuelto a informar) genera otro aviso y un reintento del mismo evento no duplica.
 */
@Injectable()
export class ShortfallNotificationHandlers {
  constructor(
    private readonly notifications: NotificationService,
    private readonly facts: NotificationFactsRepository,
  ) {}

  async onOpened(tx: DbTransaction, event: ShortfallOpened): Promise<void> {
    await this.toMember(tx, event, 'faltante_abierto', {
      amountCents: event.extraDueCents,
      dueAt: event.respondBy,
    });
  }

  async onPaymentInformed(tx: DbTransaction, event: ShortfallPaymentInformed): Promise<void> {
    const name = await this.facts.userName(tx, event.userId);
    await this.toHost(tx, event, 'faltante_pago_informado', {
      personName: name,
      amountCents: event.amountCents,
    });
  }

  async onPaymentConfirmed(tx: DbTransaction, event: ShortfallPaymentConfirmed): Promise<void> {
    await this.toMember(tx, event, 'faltante_pago_resuelto', {});
  }

  async onPaymentRejected(tx: DbTransaction, event: ShortfallPaymentRejected): Promise<void> {
    await this.toMember(tx, event, 'faltante_pago_resuelto', {
      reason: 'revisa el detalle en la app',
    });
  }

  async onRefundOpened(tx: DbTransaction, event: ShortfallRefundOpened): Promise<void> {
    const name = await this.facts.userName(tx, event.userId);
    await this.toHost(tx, event, 'devolucion_pendiente', {
      personName: name,
      amountCents: event.amountCents,
    });
  }

  async onRefundSent(tx: DbTransaction, event: ShortfallRefundSent): Promise<void> {
    await this.toMember(tx, event, 'devolucion_registrada', { amountCents: event.amountCents });
  }

  async onRefundResolved(tx: DbTransaction, event: ShortfallRefundResolved): Promise<void> {
    const name = await this.facts.userName(tx, event.userId);
    await this.toHost(tx, event, 'devolucion_resuelta', {
      personName: name,
      reason: event.result,
    });
  }

  async onClosed(tx: DbTransaction, event: ShortfallClosed): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    const recipients: [string, 'titular' | 'miembro'][] = [
      [event.hostId, 'titular'],
      ...event.userIds.map((id): [string, 'miembro'] => [id, 'miembro']),
    ];
    for (const [userId, role] of recipients) {
      await this.notifications.notify(tx, {
        userId,
        type: 'faltante_cerrado',
        role,
        entity: { type: ROUND_ENTITY, id: event.roundId },
        data: { groupId: event.groupId, groupName: group.name },
      });
    }
  }

  private async toMember(
    tx: DbTransaction,
    ref: RowRef,
    type: NotificationType,
    extra: NotificationData,
  ): Promise<void> {
    const group = await this.facts.group(tx, ref.groupId);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: ref.userId,
      type,
      entity: { type: ROW_ENTITY, id: ref.rowId },
      n: ref.rowVersion,
      data: { groupId: ref.groupId, groupName: group.name, ...extra },
    });
  }

  private async toHost(
    tx: DbTransaction,
    ref: RowRef,
    type: NotificationType,
    extra: NotificationData,
  ): Promise<void> {
    const group = await this.facts.group(tx, ref.groupId);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: ref.hostId,
      type,
      entity: { type: ROW_ENTITY, id: ref.rowId },
      n: ref.rowVersion,
      data: { groupId: ref.groupId, groupName: group.name, ...extra },
    });
  }
}
