import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import type { MemberRemoved } from '../../../shared/events/group-events.js';
import type {
  ShortfallClosed,
  ShortfallRefundOpened,
} from '../../../shared/events/shortfall-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { computeRefundDue } from '../domain/deadlines.js';
import { canCloseRound, transitionRound, type RowState } from '../domain/state.js';
import {
  ShortfallsRepository,
  type RoundRecord,
  type RowRecord,
} from '../repositories/shortfalls.repository.js';

export const toRowState = (row: RowRecord): RowState => ({
  choice: row.choice,
  extra: row.extraStatus,
  refund: row.refundStatus,
});

type RefundCause = ShortfallRefundOpened['reason'];

/**
 * Efectos compartidos por las acciones de las personas y por el barrido (spec 011): abrir la
 * devolución (la persona sale del grupo y se registra lo que pagó) y cerrar la ronda cuando todas
 * las filas están resueltas. Todos los métodos corren dentro de la transacción del llamador, con
 * el grupo y la ronda ya bloqueados.
 */
@Injectable()
export class ShortfallLifecycle {
  constructor(
    private readonly repo: ShortfallsRepository,
    private readonly members: MembersRepository,
    private readonly bus: TxEventBus,
  ) {}

  /**
   * La persona sale del grupo (como `abandono`) y su fila queda con la devolución `pendiente` por
   * lo que pagó (RN-011-03). El estado de la fila (`choice`, `extra`) ya lo calculó la transición.
   */
  async openRefund(
    tx: DbTransaction,
    round: RoundRecord,
    row: RowRecord,
    hostId: string,
    now: Date,
    cause: RefundCause,
    patch: Parameters<ShortfallsRepository['updateRow']>[2],
  ): Promise<RowRecord> {
    const updated = await this.repo.updateRow(tx, row.id, {
      ...patch,
      refundStatus: 'pendiente',
      refundAmountCents: row.paidCents,
      refundOpenedAt: now,
      refundDueAt: computeRefundDue(now),
    });
    if (await this.members.markLeft(tx, round.groupId, row.userId, 'abandono')) {
      const left: MemberRemoved = {
        type: 'groups.member-removed',
        groupId: round.groupId,
        userId: row.userId,
        reason: 'abandono',
      };
      await this.bus.publish(tx, left);
    }
    const opened: ShortfallRefundOpened = {
      type: 'shortfalls.refund-opened',
      roundId: round.id,
      groupId: round.groupId,
      hostId,
      rowId: row.id,
      userId: row.userId,
      rowVersion: updated.version,
      amountCents: row.paidCents,
      reason: cause,
    };
    await this.bus.publish(tx, opened);
    return updated;
  }

  /** Cierra la ronda si todas sus filas están resueltas (RF-011-14). Devuelve si la cerró. */
  async closeIfResolved(
    tx: DbTransaction,
    round: RoundRecord,
    hostId: string,
    now: Date,
  ): Promise<boolean> {
    if (round.status !== 'abierta') return false;
    const rows = await this.repo.listRows(tx, round.id);
    if (rows.length === 0 || !canCloseRound(rows.map(toRowState))) return false;
    transitionRound(round.status, 'close');
    await this.repo.closeRound(tx, round.id, 'cerrada', now);
    await this.repo.insertEvent(tx, {
      roundId: round.id,
      type: 'ronda_cerrada',
      actorId: null,
      occurredAt: now,
    });
    const closed: ShortfallClosed = {
      type: 'shortfalls.closed',
      roundId: round.id,
      groupId: round.groupId,
      hostId,
      userIds: rows.map((row) => row.userId),
    };
    await this.bus.publish(tx, closed);
    return true;
  }
}
