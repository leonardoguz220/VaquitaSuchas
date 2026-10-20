import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../../shared/db/db.service.js';
import type {
  ChargeCancelled,
  ChargeConfirmed,
  ChargeGenerated,
  ChargeRejected,
  ChargeSubmitted,
  MemberRemovedForNonPayment,
} from '../../../../shared/events/charge-events.js';
import type { NotificationType } from '../../domain/catalog.js';
import { NotificationFactsRepository } from '../../repositories/notification-facts.repository.js';
import { NotificationService } from '../notification.service.js';

/** Recordatorios que dejan de tener sentido cuando el cobro se paga o se cancela (RN-005-02). */
const CHARGE_REMINDERS: readonly NotificationType[] = [
  'aviso_previo',
  'recordatorio_vencimiento',
  'comprobante_pendiente_48h',
];

/**
 * Avisos de cobros (spec 005, T008). Corren en la transacción del evento: si falla el aviso se
 * revierte el hecho. El titular nunca recibe avisos de cobro como miembro (RN-005-03).
 */
@Injectable()
export class BillingNotificationHandlers {
  constructor(
    private readonly notifications: NotificationService,
    private readonly facts: NotificationFactsRepository,
    private readonly clock: Clock,
  ) {}

  async onChargeGenerated(tx: DbTransaction, event: ChargeGenerated): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group || group.ownerId === event.userId) return;
    await this.notifications.notify(tx, {
      userId: event.userId,
      type: 'cobro_generado',
      entity: { type: 'charge', id: event.chargeId },
      period: event.period,
      data: {
        groupName: group.name,
        chargeId: event.chargeId,
        amountCents: event.amountCents,
        dueAt: event.dueAt,
        paymentInfo: group.paymentInfo ?? undefined,
      },
    });
  }

  async onChargeSubmitted(tx: DbTransaction, event: ChargeSubmitted): Promise<void> {
    const [group, charge, memberName] = await Promise.all([
      this.facts.group(tx, event.groupId),
      this.facts.charge(tx, event.chargeId),
      this.facts.userName(tx, event.userId),
    ]);
    if (!group || !charge) return;
    await this.notifications.notify(tx, {
      userId: group.ownerId,
      type: 'comprobante_subido',
      entity: { type: 'charge', id: event.chargeId },
      // Cada comprobante (también un reemplazo) es un aviso nuevo.
      period: event.receiptId,
      data: {
        groupName: group.name,
        chargeId: event.chargeId,
        personName: memberName,
        amountCents: charge.amountCents,
      },
    });
  }

  async onChargeConfirmed(tx: DbTransaction, event: ChargeConfirmed): Promise<void> {
    await this.notifications.cancelForEntity(tx, 'charge', event.chargeId, CHARGE_REMINDERS);
    const [group, charge] = await Promise.all([
      this.facts.group(tx, event.groupId),
      this.facts.charge(tx, event.chargeId),
    ]);
    if (!group || !charge) return;
    await this.notifications.notify(tx, {
      userId: event.userId,
      type: 'pago_confirmado',
      entity: { type: 'charge', id: event.chargeId },
      data: { groupName: group.name, chargeId: event.chargeId, amountCents: charge.amountCents },
    });
  }

  async onChargeRejected(tx: DbTransaction, event: ChargeRejected): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: event.userId,
      type: 'pago_rechazado',
      entity: { type: 'charge', id: event.chargeId },
      // Un cobro puede rechazarse varias veces: cada rechazo es un aviso.
      period: this.clock.now().toISOString(),
      data: { groupName: group.name, chargeId: event.chargeId, reason: event.reason },
    });
  }

  async onChargeCancelled(tx: DbTransaction, event: ChargeCancelled): Promise<void> {
    await this.notifications.cancelForEntity(tx, 'charge', event.chargeId, CHARGE_REMINDERS);
  }

  async onMemberRemovedForNonPayment(
    tx: DbTransaction,
    event: MemberRemovedForNonPayment,
  ): Promise<void> {
    const [group, charge, memberName] = await Promise.all([
      this.facts.group(tx, event.groupId),
      this.facts.charge(tx, event.chargeId),
      this.facts.userName(tx, event.userId),
    ]);
    if (!group || !charge) return;
    const entity = { type: 'charge', id: event.chargeId };
    await this.notifications.notify(tx, {
      userId: event.userId,
      type: 'retiro_por_mora',
      entity,
      data: {
        groupName: group.name,
        chargeId: event.chargeId,
        amountCents: charge.amountCents,
        paymentInfo: group.paymentInfo ?? undefined,
      },
    });
    await this.notifications.notify(tx, {
      userId: group.ownerId,
      type: 'retiro_por_mora_titular',
      entity,
      data: {
        groupName: group.name,
        chargeId: event.chargeId,
        personName: memberName,
        amountCents: charge.amountCents,
        slotsFreed: 1,
      },
    });
  }
}
