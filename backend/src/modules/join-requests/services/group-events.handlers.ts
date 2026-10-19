import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import type { GroupClosed } from '../../../shared/events/group-events.js';
import type {
  JoinRequestCancelled,
  JoinRequestRejected,
} from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { UserBanned, UserSuspended } from '../../../shared/events/user-events.js';
import { PaymentReferenceService } from '../../billing/services/payment-reference.service.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { transition } from '../domain/request-state.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository, type JoinRequestRecord } from '../repositories/requests.repository.js';
import { currentDeadline, RequestLifecycle } from './request-lifecycle.js';

/**
 * Reacciona a los eventos de grupos y cuentas (spec 010 T043, RN-010-09, CA-010-32, CA-010-34).
 * Corre dentro de la transacción del hecho (TxEventBus): si algo falla, se revierte todo. Cada
 * manejador es idempotente: solo toca solicitudes todavía activas, así que repetir el evento no
 * cambia nada. Antes de decidir persiste los vencimientos (`expireIfDue`), de modo que una
 * solicitud ya vencida queda `expirada`, no `rechazada` ni `cancelada`.
 */
@Injectable()
export class GroupEventsHandlers {
  constructor(
    private readonly bus: TxEventBus,
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly groups: GroupsRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly references: PaymentReferenceService,
    private readonly clock: Clock,
  ) {}

  /** El grupo se cerró (solo con solicitudes `abierta`: las que están en pago lo impiden): se rechazan. */
  async onGroupClosed(tx: DbTransaction, event: GroupClosed): Promise<void> {
    const now = this.clock.now();
    const group = await this.groups.findById(tx, event.groupId);
    if (!group) return;
    for (const locked of await this.requests.listActiveByGroupForUpdate(tx, event.groupId)) {
      await this.rejectBySystem(tx, locked, 'grupo_cerrado', group.owner_id, now);
    }
  }

  /** Baneo: sus solicitudes como solicitante se cancelan y las de sus grupos como titular se rechazan. */
  async onUserBanned(tx: DbTransaction, event: UserBanned): Promise<void> {
    const now = this.clock.now();
    await this.cancelApplicantRequests(tx, event.userId, now);
    for (const locked of await this.requests.listActiveByHostForUpdate(tx, event.userId)) {
      await this.rejectBySystem(tx, locked, 'titular_baneado', event.userId, now);
    }
  }

  /** Suspensión: sus solicitudes activas como solicitante se cancelan; reactivar no las restituye. */
  async onUserSuspended(tx: DbTransaction, event: UserSuspended): Promise<void> {
    await this.cancelApplicantRequests(tx, event.userId, this.clock.now());
  }

  private async cancelApplicantRequests(
    tx: DbTransaction,
    userId: string,
    now: Date,
  ): Promise<void> {
    for (const locked of await this.requests.listActiveByApplicantForUpdate(tx, userId)) {
      const record = await this.lifecycle.expireIfDue(tx, locked, now);
      if (record.status === 'expirada') continue;
      transition(record.status, 'systemCancel', this.contextOf(record, now));
      await this.requests.recordCancellation(
        tx,
        record.id,
        record.status,
        'solicitante_suspendido',
        now,
      );
      await this.references.release(tx, 'join_request', record.id, now);
      await this.events.insert(tx, {
        requestId: record.id,
        type: 'cancelada',
        actorId: null,
        fromStatus: record.status,
        toStatus: 'cancelada',
        reason: 'solicitante_suspendido',
        occurredAt: now,
      });
      const group = await this.groups.findById(tx, record.groupId);
      const event: JoinRequestCancelled = {
        type: 'join-requests.cancelled',
        requestId: record.id,
        groupId: record.groupId,
        applicantId: record.applicantId,
        hostId: group?.owner_id ?? '',
        reason: 'solicitante_suspendido',
        bySystem: true,
      };
      await this.bus.publish(tx, event);
    }
  }

  private async rejectBySystem(
    tx: DbTransaction,
    locked: JoinRequestRecord,
    reason: 'grupo_cerrado' | 'titular_baneado',
    hostId: string,
    now: Date,
  ): Promise<void> {
    const record = await this.lifecycle.expireIfDue(tx, locked, now);
    if (record.status === 'expirada') return;
    transition(record.status, 'systemReject', this.contextOf(record, now));
    await this.requests.recordSystemRejection(tx, record.id, record.status, reason, now);
    await this.references.release(tx, 'join_request', record.id, now);
    await this.events.insert(tx, {
      requestId: record.id,
      type: 'rechazada',
      actorId: null,
      fromStatus: record.status,
      toStatus: 'rechazada',
      reason,
      occurredAt: now,
    });
    const event: JoinRequestRejected = {
      type: 'join-requests.rejected',
      requestId: record.id,
      groupId: record.groupId,
      applicantId: record.applicantId,
      hostId,
      reason,
      byHost: false,
      rejectedAsFalse: false,
    };
    await this.bus.publish(tx, event);
  }

  private contextOf(record: JoinRequestRecord, now: Date) {
    return { now, windowOpen: true, slotAvailable: true, deadlineAt: currentDeadline(record) };
  }
}
