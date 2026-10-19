import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import { Clock } from '../../../shared/clock/clock.js';
import type {
  JoinRequestCancelled,
  JoinRequestRejected,
} from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { GroupClosed } from '../../../shared/events/group-events.js';
import type { UserBanned, UserSuspended } from '../../../shared/events/user-events.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { transition } from '../domain/request-state.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository, type JoinRequestRecord } from '../repositories/requests.repository.js';
import { currentDeadline, RequestLifecycle } from './request-lifecycle.js';

/**
 * Efecto de los eventos de grupo y de cuenta sobre las solicitudes activas (RN-010-09,
 * CA-010-32, CA-010-34): el cierre del grupo y el baneo del titular las rechazan; la suspensión
 * o el baneo del solicitante las cancelan. Corren dentro de la transacción del evento.
 */
@Injectable()
export class GroupEventsHandlers {
  constructor(
    private readonly clock: Clock,
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly groups: GroupsRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly bus: TxEventBus,
  ) {}

  register(bus: TxEventBus): void {
    bus.register<GroupClosed>('groups.closed', (tx, e) => this.onGroupClosed(tx, e));
    bus.register<UserBanned>('users.banned', (tx, e) => this.onUserBanned(tx, e));
    bus.register<UserSuspended>('users.suspended', (tx, e) =>
      this.onApplicantRestricted(tx, e.userId),
    );
  }

  async onGroupClosed(tx: DbTransaction, event: GroupClosed): Promise<void> {
    const now = this.clock.now();
    const active = await this.requests.listActiveByGroupForUpdate(tx, event.groupId);
    for (const record of active) await this.reject(tx, record, 'grupo_cerrado', now);
  }

  async onUserBanned(tx: DbTransaction, event: UserBanned): Promise<void> {
    const now = this.clock.now();
    const hosted = await this.requests.listActiveByHostForUpdate(tx, event.userId);
    for (const record of hosted) await this.reject(tx, record, 'titular_baneado', now);
    await this.onApplicantRestricted(tx, event.userId);
  }

  private async onApplicantRestricted(tx: DbTransaction, userId: string): Promise<void> {
    const now = this.clock.now();
    const active = await this.requests.listActiveByApplicantForUpdate(tx, userId);
    for (const record of active) await this.cancel(tx, record, now);
  }

  /** Persiste antes un vencimiento ya cumplido; `null` si la solicitud ya no está activa. */
  private async stillActive(
    tx: DbTransaction,
    record: JoinRequestRecord,
    now: Date,
  ): Promise<JoinRequestRecord | null> {
    const current = await this.lifecycle.expireIfDue(tx, record, now);
    return current.status === 'abierta' ||
      current.status === 'esperando_pago' ||
      current.status === 'pago_informado'
      ? current
      : null;
  }

  private async reject(
    tx: DbTransaction,
    locked: JoinRequestRecord,
    reason: 'grupo_cerrado' | 'titular_baneado',
    now: Date,
  ): Promise<void> {
    const record = await this.stillActive(tx, locked, now);
    if (record === null) return;
    transition(record.status, 'systemReject', {
      now,
      windowOpen: true,
      slotAvailable: true,
      deadlineAt: currentDeadline(record),
    });
    if (!(await this.requests.recordSystemRejection(tx, record.id, record.status, reason, now))) {
      return;
    }
    await this.events.insert(tx, {
      requestId: record.id,
      type: 'rechazada',
      actorId: null,
      fromStatus: record.status,
      toStatus: 'rechazada',
      reason,
      occurredAt: now,
    });
    const group = await this.groups.findById(tx, record.groupId);
    const event: JoinRequestRejected = {
      type: 'join-requests.rejected',
      requestId: record.id,
      groupId: record.groupId,
      applicantId: record.applicantId,
      hostId: group?.owner_id ?? '',
      reason,
      byHost: false,
      rejectedAsFalse: false,
    };
    await this.bus.publish(tx, event);
  }

  private async cancel(tx: DbTransaction, locked: JoinRequestRecord, now: Date): Promise<void> {
    const record = await this.stillActive(tx, locked, now);
    if (record === null) return;
    const reason = 'solicitante_suspendido';
    transition(record.status, 'systemCancel', {
      now,
      windowOpen: true,
      slotAvailable: true,
      deadlineAt: currentDeadline(record),
    });
    if (!(await this.requests.recordCancellation(tx, record.id, record.status, reason, now))) {
      return;
    }
    await this.events.insert(tx, {
      requestId: record.id,
      type: 'cancelada',
      actorId: null,
      fromStatus: record.status,
      toStatus: 'cancelada',
      reason,
      occurredAt: now,
    });
    const group = await this.groups.findById(tx, record.groupId);
    const event: JoinRequestCancelled = {
      type: 'join-requests.cancelled',
      requestId: record.id,
      groupId: record.groupId,
      applicantId: record.applicantId,
      hostId: group?.owner_id ?? '',
      reason,
      bySystem: true,
    };
    await this.bus.publish(tx, event);
  }
}
