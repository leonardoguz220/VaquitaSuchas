import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../../shared/db/db.service.js';
import type {
  ChatMessageSent,
  DecisionReminderDue,
  DisputeOpened,
  DisputeResolved,
  JoinRequestAccepted,
  JoinRequestExpired,
  JoinRequestOpened,
  JoinRequestRejected,
  PaymentDataSent,
  ProofSubmitted,
} from '../../../../shared/events/join-request-events.js';
import type { NotificationType } from '../../domain/catalog.js';
import type { NotificationData } from '../../domain/templates.js';
import { NotificationFactsRepository } from '../../repositories/notification-facts.repository.js';
import { NotificationService } from '../notification.service.js';

interface RequestRef {
  requestId: string;
  groupId: string;
  applicantId: string;
  hostId: string;
}

const REQUEST_ENTITY = 'join_request';
const minutesUntil = (deadline: Date, now: Date): number =>
  Math.max(1, Math.round((deadline.getTime() - now.getTime()) / 60_000));
const humanize = (reason: string): string => reason.replace(/_/g, ' ');

const DISPUTE_RESULT: Record<DisputeResolved['result'], string> = {
  estafa_confirmada: 'se confirmó la estafa',
  sin_falta: 'no se encontró falta de ninguna de las partes',
};

/**
 * Avisos de las solicitudes de ingreso (spec 005, T011; eventos de la spec 010). Los eventos no
 * llevan texto de mensajes ni referencias: el aviso de chat solo cuenta, nunca copia el contenido.
 */
@Injectable()
export class JoinRequestNotificationHandlers {
  constructor(
    private readonly notifications: NotificationService,
    private readonly facts: NotificationFactsRepository,
    private readonly clock: Clock,
  ) {}

  async onOpened(tx: DbTransaction, event: JoinRequestOpened): Promise<void> {
    await this.toHost(tx, event, 'solicitud_nueva', {});
  }

  async onProofSubmitted(tx: DbTransaction, event: ProofSubmitted): Promise<void> {
    await this.toHost(
      tx,
      event,
      'solicitud_comprobante',
      {
        minutes: minutesUntil(event.decisionDeadlineAt, this.clock.now()),
      },
      event.decisionDeadlineAt.toISOString(),
    );
  }

  async onDecisionReminderDue(tx: DbTransaction, event: DecisionReminderDue): Promise<void> {
    // Un solo recordatorio por solicitud (CA-005-27).
    await this.toHost(tx, event, 'solicitud_recordatorio_30', {});
  }

  async onPaymentDataSent(tx: DbTransaction, event: PaymentDataSent): Promise<void> {
    const paymentText = await this.facts.requestPaymentText(tx, event.requestId);
    await this.toApplicant(
      tx,
      event,
      'solicitud_datos_pago',
      {
        amountCents: event.amountCents,
        minutes: minutesUntil(event.payDeadlineAt, this.clock.now()),
        paymentInfo: paymentText ?? undefined,
      },
      event.payDeadlineAt.toISOString(),
    );
  }

  async onAccepted(tx: DbTransaction, event: JoinRequestAccepted): Promise<void> {
    await this.toApplicant(tx, event, 'solicitud_aceptada', {});
  }

  async onRejected(tx: DbTransaction, event: JoinRequestRejected): Promise<void> {
    await this.toApplicant(tx, event, 'solicitud_rechazada', { reason: humanize(event.reason) });
  }

  async onExpired(tx: DbTransaction, event: JoinRequestExpired): Promise<void> {
    await this.toApplicant(tx, event, 'solicitud_expirada', {});
  }

  /**
   * Una sola notificación por tanda de mensajes sin leer: la clave lleva el último mensaje leído
   * por el destinatario, así que mientras no abra el chat los mensajes nuevos no generan otro aviso.
   */
  async onChatMessageSent(tx: DbTransaction, event: ChatMessageSent): Promise<void> {
    const [group, senderName, lastRead] = await Promise.all([
      this.facts.group(tx, event.groupId),
      this.facts.userName(tx, event.senderId),
      this.facts.lastReadSeq(tx, event.requestId, event.recipientId),
    ]);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: event.recipientId,
      type: 'solicitud_mensaje',
      role: event.recipientId === event.hostId ? 'titular' : 'miembro',
      entity: { type: 'join_chat', id: event.requestId },
      n: lastRead,
      data: { requestId: event.requestId, groupName: group.name, personName: senderName, count: 1 },
    });
  }

  async onDisputeOpened(tx: DbTransaction, event: DisputeOpened): Promise<void> {
    const [group, openerName] = await Promise.all([
      this.facts.group(tx, event.groupId),
      this.facts.userName(tx, event.openedBy),
    ]);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: event.accusedId,
      type: 'reclamo_abierto',
      role: event.accusedId === event.hostId ? 'titular' : 'miembro',
      entity: { type: 'dispute', id: event.disputeId },
      data: {
        requestId: event.requestId,
        disputeId: event.disputeId,
        groupName: group.name,
        personName: openerName,
      },
    });
  }

  async onDisputeResolved(tx: DbTransaction, event: DisputeResolved): Promise<void> {
    const group = await this.facts.group(tx, event.groupId);
    if (!group) return;
    for (const [userId, role] of [
      [event.hostId, 'titular'],
      [event.applicantId, 'miembro'],
    ] as const) {
      await this.notifications.notify(tx, {
        userId,
        type: 'reclamo_resuelto',
        role,
        entity: { type: 'dispute', id: event.disputeId },
        data: {
          requestId: event.requestId,
          disputeId: event.disputeId,
          groupName: group.name,
          reason: DISPUTE_RESULT[event.result],
        },
      });
    }
  }

  private async toHost(
    tx: DbTransaction,
    ref: RequestRef,
    type: NotificationType,
    extra: NotificationData,
    period?: string,
  ): Promise<void> {
    const [group, applicantName] = await Promise.all([
      this.facts.group(tx, ref.groupId),
      this.facts.userName(tx, ref.applicantId),
    ]);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: ref.hostId,
      type,
      entity: { type: REQUEST_ENTITY, id: ref.requestId },
      period,
      data: {
        requestId: ref.requestId,
        groupName: group.name,
        personName: applicantName,
        ...extra,
      },
    });
  }

  private async toApplicant(
    tx: DbTransaction,
    ref: RequestRef,
    type: NotificationType,
    extra: NotificationData,
    period?: string,
  ): Promise<void> {
    const group = await this.facts.group(tx, ref.groupId);
    if (!group) return;
    await this.notifications.notify(tx, {
      userId: ref.applicantId,
      type,
      entity: { type: REQUEST_ENTITY, id: ref.requestId },
      period,
      data: { requestId: ref.requestId, groupId: ref.groupId, groupName: group.name, ...extra },
    });
  }
}
