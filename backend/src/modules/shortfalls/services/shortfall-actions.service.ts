import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  ShortfallPaymentConfirmed,
  ShortfallPaymentInformed,
  ShortfallPaymentRejected,
  ShortfallRefundResolved,
  ShortfallRefundSent,
} from '../../../shared/events/shortfall-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { assertGroupWritable } from '../../subscriptions/services/group-errors.js';
import { computePayDeadline } from '../domain/deadlines.js';
import { transitionRow, type RowAction } from '../domain/state.js';
import {
  ShortfallsRepository,
  type RoundRecord,
  type RowRecord,
} from '../repositories/shortfalls.repository.js';
import { ShortfallLifecycle, toRowState } from './shortfall-lifecycle.js';
import { ShortfallViewService } from './shortfall-view.service.js';
import type { ShortfallRowView } from './shortfall-views.js';

export const MAX_REFERENCE_LENGTH = 100;

export type PaymentMethod = 'qr' | 'transferencia';
export type RefundMethod = 'qr' | 'transferencia' | 'efectivo';

interface WithVersion {
  version?: number | null;
}

export interface RespondInput extends WithVersion {
  choice: 'cubrir' | 'devolucion';
}

export interface PayInput extends WithVersion {
  method: PaymentMethod;
  reference: string;
}

export interface RejectPaymentInput extends WithVersion {
  reason: string;
}

export interface SendRefundInput extends WithVersion {
  method: RefundMethod;
  reference: string;
}

export interface DisputeRefundInput extends WithVersion {
  reason: string;
}

type Role = 'titular' | 'afectado';

interface Locked {
  tx: DbTransaction;
  group: GroupRow;
  round: RoundRecord;
  row: RowRecord;
  now: Date;
}

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
const staleState = (): DomainError =>
  new DomainError('STALE_STATE', 409, 'La información cambió: vuelve a cargar e intenta de nuevo.');
const invalidTransition = (action: string): DomainError =>
  new DomainError('INVALID_TRANSITION', 409, 'Esa acción no es válida para el estado actual.', {
    action,
  });

const fieldError = (field: string, code: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [code] },
  });

const cleanReference = (reference: string): string => {
  const value = reference.trim();
  if (value.length === 0 || value.length > MAX_REFERENCE_LENGTH) {
    throw fieldError('reference', 'INVALID_REFERENCE');
  }
  return value;
};

const cleanReason = (reason: string, min: number, max: number): string => {
  const value = reason.trim();
  if (value.length < min || value.length > max) throw fieldError('reason', 'INVALID_REASON');
  return value;
};

/** Acciones de los afectados y del titular sobre una fila de la ronda (spec 011, RF-011-08 a 13). */
@Injectable()
export class ShortfallActionsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly repo: ShortfallsRepository,
    private readonly lifecycle: ShortfallLifecycle,
    private readonly views: ShortfallViewService,
  ) {}

  /** `POST /shortfall-rows/:rowId/respond` (afectado; RF-011-08 y 09, CA-011-05 y 06). */
  respond(userId: string, rowId: string, input: RespondInput): Promise<ShortfallRowView> {
    return this.act(userId, rowId, 'afectado', input, true, true, async (l) => {
      const action: RowAction = input.choice === 'cubrir' ? 'cover' : 'requestRefund';
      const next = transitionRow(toRowState(l.row), action, this.context(l));
      if (input.choice === 'cubrir') {
        const deadline = computePayDeadline(l.now, l.round.payBy);
        await this.repo.updateRow(l.tx, l.row.id, {
          choice: next.choice,
          respondedAt: l.now,
          extraStatus: next.extra,
          extraDeadlineAt: deadline,
        });
        await this.event(l, 'cubrir_elegido', l.row.userId);
        return;
      }
      await this.lifecycle.openRefund(l.tx, l.round, l.row, l.group.owner_id, l.now, 'devolucion', {
        choice: next.choice,
        respondedAt: l.now,
      });
      await this.event(l, 'devolucion_elegida', l.row.userId);
    });
  }

  /** `POST /shortfall-rows/:rowId/pay` (afectado; RF-011-10). */
  pay(userId: string, rowId: string, input: PayInput): Promise<ShortfallRowView> {
    const reference = cleanReference(input.reference);
    return this.act(userId, rowId, 'afectado', input, true, true, async (l) => {
      const next = transitionRow(toRowState(l.row), 'pay', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        extraStatus: next.extra,
        extraMethod: input.method,
        extraReference: reference,
        extraInformedAt: l.now,
        extraRejectReason: null,
      });
      await this.event(l, 'pago_informado', l.row.userId, null, { method: input.method });
      const event: ShortfallPaymentInformed = {
        type: 'shortfalls.payment-informed',
        ...this.base(l, updated),
        amountCents: l.row.extraDueCents,
      };
      await this.bus.publish(l.tx, event);
    });
  }

  /** `POST /shortfall-rows/:rowId/confirm-payment` (titular; RF-011-10, CA-011-07). */
  confirmPayment(userId: string, rowId: string, input: WithVersion): Promise<ShortfallRowView> {
    return this.act(userId, rowId, 'titular', input, true, true, async (l) => {
      const next = transitionRow(toRowState(l.row), 'confirmPayment', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        extraStatus: next.extra,
        extraConfirmedAt: l.now,
        extraConfirmedBy: l.group.owner_id,
      });
      await this.event(l, 'pago_confirmado', l.group.owner_id);
      const event: ShortfallPaymentConfirmed = {
        type: 'shortfalls.payment-confirmed',
        ...this.base(l, updated),
      };
      await this.bus.publish(l.tx, event);
    });
  }

  /** `POST /shortfall-rows/:rowId/reject-payment` (titular; RF-011-10, CA-011-07). */
  rejectPayment(
    userId: string,
    rowId: string,
    input: RejectPaymentInput,
  ): Promise<ShortfallRowView> {
    const reason = cleanReason(input.reason, 5, 200);
    return this.act(userId, rowId, 'titular', input, true, true, async (l) => {
      const next = transitionRow(toRowState(l.row), 'rejectPayment', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        extraStatus: next.extra,
        extraRejectReason: reason,
      });
      await this.event(l, 'pago_rechazado', l.group.owner_id, reason);
      const event: ShortfallPaymentRejected = {
        type: 'shortfalls.payment-rejected',
        ...this.base(l, updated),
        payDeadlineAt: updated.extraDeadlineAt,
      };
      await this.bus.publish(l.tx, event);
    });
  }

  /** `POST /shortfall-rows/:rowId/refund` (titular; RF-011-12, CA-011-10). */
  sendRefund(userId: string, rowId: string, input: SendRefundInput): Promise<ShortfallRowView> {
    const reference = cleanReference(input.reference);
    return this.act(userId, rowId, 'titular', input, false, false, async (l) => {
      const next = transitionRow(toRowState(l.row), 'sendRefund', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        refundStatus: next.refund,
        refundMethod: input.method,
        refundReference: reference,
        refundSentAt: l.now,
      });
      await this.event(l, 'devolucion_registrada', l.group.owner_id, null, {
        method: input.method,
      });
      const event: ShortfallRefundSent = {
        type: 'shortfalls.refund-sent',
        ...this.base(l, updated),
        amountCents: l.row.paidCents,
      };
      await this.bus.publish(l.tx, event);
    });
  }

  /** `POST /shortfall-rows/:rowId/refund/confirm` (afectado; RF-011-12, CA-011-11). */
  confirmRefund(userId: string, rowId: string, input: WithVersion): Promise<ShortfallRowView> {
    return this.act(userId, rowId, 'afectado', input, false, false, async (l) => {
      const next = transitionRow(toRowState(l.row), 'confirmRefund', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        refundStatus: next.refund,
        refundConfirmedAt: l.now,
      });
      await this.event(l, 'devolucion_confirmada', l.row.userId);
      await this.publishResolved(l, updated, 'confirmada');
    });
  }

  /** `POST /shortfall-rows/:rowId/refund/dispute` (afectado; RF-011-13, CA-011-11). */
  disputeRefund(
    userId: string,
    rowId: string,
    input: DisputeRefundInput,
  ): Promise<ShortfallRowView> {
    const reason = cleanReason(input.reason, 5, 300);
    return this.act(userId, rowId, 'afectado', input, false, false, async (l) => {
      const next = transitionRow(toRowState(l.row), 'disputeRefund', this.context(l));
      const updated = await this.repo.updateRow(l.tx, l.row.id, {
        refundStatus: next.refund,
        refundDisputedAt: l.now,
        refundDisputeReason: reason,
      });
      await this.event(l, 'devolucion_disputada', l.row.userId, reason);
      await this.publishResolved(l, updated, 'disputada');
    });
  }

  private context(l: Locked): Parameters<typeof transitionRow>[2] {
    return {
      now: l.now,
      respondBy: l.round.respondBy,
      extraDeadlineAt: l.row.extraDeadlineAt,
      refundDueAt: l.row.refundDueAt,
    };
  }

  private base(l: Locked, updated: RowRecord) {
    return {
      roundId: l.round.id,
      groupId: l.round.groupId,
      hostId: l.group.owner_id,
      rowId: updated.id,
      userId: updated.userId,
      rowVersion: updated.version,
    };
  }

  private async publishResolved(
    l: Locked,
    updated: RowRecord,
    result: ShortfallRefundResolved['result'],
  ): Promise<void> {
    const event: ShortfallRefundResolved = {
      type: 'shortfalls.refund-resolved',
      ...this.base(l, updated),
      result,
    };
    await this.bus.publish(l.tx, event);
  }

  private event(
    l: Locked,
    type: Parameters<ShortfallsRepository['insertEvent']>[1]['type'],
    actorId: string | null,
    reason: string | null = null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.repo.insertEvent(l.tx, {
      roundId: l.round.id,
      responseId: l.row.id,
      type,
      actorId,
      reason,
      metadata,
      occurredAt: l.now,
    });
  }

  /**
   * Plantilla común: autoriza a quien llama, bloquea grupo → ronda → fila (en ese orden), valida la
   * versión y, si corresponde, que la ronda siga abierta y el grupo admita cambios; luego ejecuta la
   * acción, cierra la ronda si quedó resuelta y devuelve la fila vista por quien actuó.
   */
  private async act(
    userId: string,
    rowId: string,
    role: Role,
    input: WithVersion,
    requiresOpenRound: boolean,
    requiresWritableGroup: boolean,
    action: (l: Locked) => Promise<void>,
  ): Promise<ShortfallRowView> {
    const peek = await this.repo.findRow(this.db, rowId);
    if (!peek) throw notFound();
    const peekRound = await this.repo.findRound(this.db, peek.roundId);
    if (!peekRound) throw notFound();
    await this.authorize(userId, role, peek, peekRound.groupId);
    const now = this.clock.now();
    return this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, peekRound.groupId);
      if (!group) throw notFound();
      const round = await this.repo.findRound(tx, peek.roundId, true);
      const row = await this.repo.findRow(tx, rowId, true);
      if (!round || !row) throw notFound();
      if (input.version !== undefined && input.version !== null && input.version !== row.version) {
        throw staleState();
      }
      if (requiresOpenRound && round.status !== 'abierta') throw invalidTransition('round-closed');
      if (requiresWritableGroup) assertGroupWritable(group);
      const locked: Locked = { tx, group, round, row, now };
      await action(locked);
      await this.lifecycle.closeIfResolved(tx, round, group.owner_id, now);
      const updatedRound = (await this.repo.findRound(tx, round.id)) as RoundRecord;
      const updatedRow = (await this.repo.findRow(tx, rowId)) as RowRecord;
      return this.views.row(tx, updatedRound, updatedRow, group.owner_id, userId, now);
    });
  }

  /** El afectado es dueño de su fila aunque ya haya salido del grupo; el titular, del grupo. */
  private async authorize(
    userId: string,
    role: Role,
    row: RowRecord,
    groupId: string,
  ): Promise<void> {
    const group = await this.groups.findById(this.db, groupId);
    if (!group) throw notFound();
    const isOwner = group.owner_id === userId;
    const isAffected = row.userId === userId;
    if ((role === 'titular' && isOwner) || (role === 'afectado' && isAffected)) return;
    if (isOwner || isAffected || (await this.members.findActive(this.db, groupId, userId))) {
      throw forbidden();
    }
    throw notFound();
  }
}
