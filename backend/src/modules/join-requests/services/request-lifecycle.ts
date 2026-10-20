import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import type { JoinRequestExpired } from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { effectiveState, type EffectiveState } from '../domain/effective-state.js';
import { transition } from '../domain/request-state.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository, type JoinRequestRecord } from '../repositories/requests.repository.js';

const DAY_MS = 24 * 3600_000;

/**
 * Estado efectivo de un registro leído (sin escribir, R1): si `abierta` venció porque terminó la
 * ventana (y no por las 24 h), el motivo es `ventana_cerrada`.
 */
export function effectiveOf(record: JoinRequestRecord, now: Date): EffectiveState {
  const closedByWindow =
    record.openDeadlineAt.getTime() < record.openedAt.getTime() + DAY_MS
      ? record.openDeadlineAt
      : null;
  return effectiveState(
    {
      status: record.status,
      openDeadlineAt: record.openDeadlineAt,
      payDeadlineAt: record.payDeadlineAt,
      decisionDeadlineAt: record.decisionDeadlineAt,
      windowEndsAt: closedByWindow,
      finalReason: record.finalReason,
    },
    now,
  );
}

/** Plazo vigente del estado almacenado (para la máquina de estados). */
export function currentDeadline(record: JoinRequestRecord): Date | null {
  switch (record.status) {
    case 'abierta':
      return record.openDeadlineAt;
    case 'esperando_pago':
      return record.payDeadlineAt;
    case 'pago_informado':
      return record.decisionDeadlineAt;
    default:
      return null;
  }
}

/**
 * Persiste los vencimientos al actuar (research R1, RNF-010-03): cada acción llama a
 * `expireIfDue` con la solicitud bloqueada y luego decide con el registro devuelto.
 */
@Injectable()
export class RequestLifecycle {
  constructor(
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly groups: GroupsRepository,
    private readonly bus: TxEventBus,
  ) {}

  /** Si el plazo venció, pasa a `expirada` con su motivo, deja el evento y publica; si no, devuelve el mismo registro. */
  async expireIfDue(
    tx: DbTransaction,
    record: JoinRequestRecord,
    now: Date,
  ): Promise<JoinRequestRecord> {
    const effective = effectiveOf(record, now);
    if (effective.status !== 'expirada' || record.status === 'expirada') return record;
    // La máquina de estados valida la transición; `windowOpen: true` porque el plazo ya venció.
    const to = transition(record.status, 'expire', {
      now,
      windowOpen: true,
      slotAvailable: true,
      deadlineAt: currentDeadline(record),
    });
    const reason = effective.reason as string;
    const changed = await this.requests.markExpired(tx, record.id, record.status, reason, now);
    if (!changed) return (await this.requests.findById(tx, record.id)) ?? record;
    await this.events.insert(tx, {
      requestId: record.id,
      type: 'expirada',
      actorId: null,
      fromStatus: record.status,
      toStatus: to,
      reason,
      occurredAt: now,
    });
    const group = await this.groups.findById(tx, record.groupId);
    const event: JoinRequestExpired = {
      type: 'join-requests.expired',
      requestId: record.id,
      groupId: record.groupId,
      applicantId: record.applicantId,
      hostId: group?.owner_id ?? '',
      reason,
    };
    await this.bus.publish(tx, event);
    return (await this.requests.findById(tx, record.id)) ?? record;
  }
}
