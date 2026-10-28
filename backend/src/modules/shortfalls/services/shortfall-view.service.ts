import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { allowedRoundActions, allowedRowActions, type Viewer } from '../domain/allowed-actions.js';
import {
  ShortfallsRepository,
  type RoundRecord,
  type RowRecord,
  type TimelineRow,
} from '../repositories/shortfalls.repository.js';
import { toRowState } from './shortfall-lifecycle.js';
import type { ShortfallRoundView, ShortfallRowView, TimelineEntryView } from './shortfall-views.js';

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

const entry = (event: TimelineRow): TimelineEntryView => ({
  type: event.type,
  actor: event.actorId === null ? null : { userId: event.actorId, fullName: event.actorName ?? '' },
  reason: event.reason,
  occurredAt: event.occurredAt.toISOString(),
});

/** Arma las vistas (sin montos calculados en el cliente) de rondas y filas (contrato de la spec 011). */
@Injectable()
export class ShortfallViewService {
  constructor(private readonly repo: ShortfallsRepository) {}

  /**
   * Ronda vista por `viewerId`: el titular ve todas las filas; un afectado, solo la suya
   * (CA-011-13). `hostId` es el titular del grupo.
   */
  async round(
    q: Queryable,
    round: RoundRecord,
    hostId: string,
    viewerId: string,
    now: Date,
  ): Promise<ShortfallRoundView> {
    const viewer: Viewer = viewerId === hostId ? 'titular' : 'afectado';
    const [allRows, events] = await Promise.all([
      this.repo.listRows(q, round.id),
      this.repo.listEvents(q, round.id),
    ]);
    const visible = viewer === 'titular' ? allRows : allRows.filter((r) => r.userId === viewerId);
    return {
      id: round.id,
      groupId: round.groupId,
      period: round.period,
      roundNumber: round.roundNumber,
      status: round.status,
      totalBsCents: round.totalBsCents,
      memberCountAfter: round.memberCountAfter,
      baseShareCents: round.baseShareCents,
      ownerShareCents: round.ownerShareCents,
      shortfallCents: round.shortfallCents,
      openedAt: round.openedAt.toISOString(),
      respondBy: round.respondBy.toISOString(),
      payBy: round.payBy.toISOString(),
      closedAt: iso(round.closedAt),
      version: round.version,
      rows: visible.map((row) => this.rowFrom(round, row, viewer, events, now)),
      allowedActions: allowedRoundActions(viewer, round.status, allRows.map(toRowState)),
    };
  }

  async row(
    q: Queryable,
    round: RoundRecord,
    row: RowRecord,
    hostId: string,
    viewerId: string,
    now: Date,
  ): Promise<ShortfallRowView> {
    const viewer: Viewer = viewerId === hostId ? 'titular' : 'afectado';
    const events = await this.repo.listEvents(q, round.id);
    return this.rowFrom(round, row, viewer, events, now);
  }

  private rowFrom(
    round: RoundRecord,
    row: RowRecord,
    viewer: Viewer,
    events: readonly TimelineRow[],
    now: Date,
  ): ShortfallRowView {
    const refundDueReached = row.refundDueAt !== null && now.getTime() >= row.refundDueAt.getTime();
    return {
      id: row.id,
      roundId: row.roundId,
      groupId: round.groupId,
      member: { userId: row.userId, fullName: row.fullName },
      paidCents: row.paidCents,
      extraDueCents: row.extraDueCents,
      choice: row.choice,
      extra: {
        status: row.extraStatus,
        method: row.extraMethod,
        reference: row.extraReference,
        deadlineAt: iso(row.extraDeadlineAt),
        rejectReason: row.extraRejectReason,
      },
      refund: {
        status: row.refundStatus,
        amountCents: row.refundAmountCents,
        method: row.refundMethod,
        reference: row.refundReference,
        dueAt: iso(row.refundDueAt),
        disputeReason: row.refundDisputeReason,
      },
      version: row.version,
      allowedActions: allowedRowActions(viewer, round.status, toRowState(row), refundDueReached),
      timeline: events
        .filter((event) => event.responseId === row.id || event.responseId === null)
        .map(entry),
    };
  }
}
