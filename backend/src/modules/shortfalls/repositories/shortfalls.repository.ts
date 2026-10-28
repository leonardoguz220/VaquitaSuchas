import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { Choice, ExtraStatus, RefundStatus, RoundStatus } from '../domain/state.js';

export interface CycleRow {
  id: string;
  period: string;
  totalBsCents: number;
}

export interface PaidRow {
  userId: string;
  fullName: string;
  paidCents: number;
}

export interface RoundRecord {
  id: string;
  groupId: string;
  cycleId: string;
  period: string;
  roundNumber: number;
  status: RoundStatus;
  totalBsCents: number;
  memberCountAfter: number;
  baseShareCents: number;
  ownerShareCents: number;
  shortfallCents: number;
  openedBy: string;
  openedAt: Date;
  respondBy: Date;
  payBy: Date;
  closedAt: Date | null;
  version: number;
}

export interface RowRecord {
  id: string;
  roundId: string;
  userId: string;
  fullName: string;
  paidCents: number;
  extraDueCents: number;
  choice: Choice;
  respondedAt: Date | null;
  extraStatus: ExtraStatus;
  extraMethod: 'qr' | 'transferencia' | null;
  extraReference: string | null;
  extraDeadlineAt: Date | null;
  extraRejectReason: string | null;
  refundStatus: RefundStatus;
  refundAmountCents: number | null;
  refundMethod: 'qr' | 'transferencia' | 'efectivo' | null;
  refundReference: string | null;
  refundDueAt: Date | null;
  refundDisputeReason: string | null;
  version: number;
}

export interface DisputedRefundRecord {
  rowId: string;
  groupId: string;
  groupName: string;
  period: string;
  memberName: string;
  hostName: string;
  refundAmountCents: number;
  refundMethod: 'qr' | 'transferencia' | 'efectivo' | null;
  refundReference: string | null;
  disputeReason: string;
  disputedAt: Date;
}

export interface NewRound {
  groupId: string;
  cycleId: string;
  period: string;
  roundNumber: number;
  totalBsCents: number;
  memberCountAfter: number;
  baseShareCents: number;
  ownerShareCents: number;
  shortfallCents: number;
  openedBy: string;
  openedAt: Date;
  respondBy: Date;
  payBy: Date;
}

export interface NewRow {
  roundId: string;
  userId: string;
  paidCents: number;
  extraDueCents: number;
}

export type ShortfallEventType =
  | 'ronda_abierta'
  | 'ronda_cancelada'
  | 'ronda_cerrada'
  | 'cubrir_elegido'
  | 'devolucion_elegida'
  | 'sin_respuesta'
  | 'pago_informado'
  | 'pago_confirmado'
  | 'pago_rechazado'
  | 'pago_vencido'
  | 'devolucion_registrada'
  | 'devolucion_confirmada'
  | 'devolucion_disputada';

export interface NewShortfallEvent {
  roundId: string;
  responseId?: string | null;
  type: ShortfallEventType;
  /** `null` = el sistema. */
  actorId: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

export interface TimelineRow {
  responseId: string | null;
  type: ShortfallEventType;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  occurredAt: Date;
}

/** Cambios permitidos sobre una fila; cada clave corresponde a una columna de `shortfall_responses`. */
export interface RowPatch {
  choice?: Choice;
  respondedAt?: Date | null;
  extraStatus?: ExtraStatus;
  extraMethod?: 'qr' | 'transferencia' | null;
  extraReference?: string | null;
  extraInformedAt?: Date | null;
  extraConfirmedAt?: Date | null;
  extraConfirmedBy?: string | null;
  extraDeadlineAt?: Date | null;
  extraRejectReason?: string | null;
  refundStatus?: RefundStatus;
  refundAmountCents?: number | null;
  refundMethod?: 'qr' | 'transferencia' | 'efectivo' | null;
  refundReference?: string | null;
  refundOpenedAt?: Date | null;
  refundDueAt?: Date | null;
  refundSentAt?: Date | null;
  refundConfirmedAt?: Date | null;
  refundDisputedAt?: Date | null;
  refundDisputeReason?: string | null;
}

const PATCH_COLUMNS: Record<keyof RowPatch, string> = {
  choice: 'choice',
  respondedAt: 'responded_at',
  extraStatus: 'extra_status',
  extraMethod: 'extra_method',
  extraReference: 'extra_reference',
  extraInformedAt: 'extra_informed_at',
  extraConfirmedAt: 'extra_confirmed_at',
  extraConfirmedBy: 'extra_confirmed_by',
  extraDeadlineAt: 'extra_deadline_at',
  extraRejectReason: 'extra_reject_reason',
  refundStatus: 'refund_status',
  refundAmountCents: 'refund_amount_cents',
  refundMethod: 'refund_method',
  refundReference: 'refund_reference',
  refundOpenedAt: 'refund_opened_at',
  refundDueAt: 'refund_due_at',
  refundSentAt: 'refund_sent_at',
  refundConfirmedAt: 'refund_confirmed_at',
  refundDisputedAt: 'refund_disputed_at',
  refundDisputeReason: 'refund_dispute_reason',
};

const ROUND_COLUMNS = `r.id, r.group_id, r.cycle_id, r.period, r.round_number, r.status,
  r.total_bs_cents::text AS total_bs_cents, r.member_count_after,
  r.base_share_cents::text AS base_share_cents, r.owner_share_cents::text AS owner_share_cents,
  r.shortfall_cents::text AS shortfall_cents, r.opened_by, r.opened_at, r.respond_by, r.pay_by,
  r.closed_at, r.version`;

const ROW_COLUMNS = `s.id, s.round_id, s.user_id, u.full_name, s.paid_cents::text AS paid_cents,
  s.extra_due_cents::text AS extra_due_cents, s.choice, s.responded_at, s.extra_status,
  s.extra_method, s.extra_reference, s.extra_deadline_at, s.extra_reject_reason, s.refund_status,
  s.refund_amount_cents::text AS refund_amount_cents, s.refund_method, s.refund_reference,
  s.refund_due_at, s.refund_dispute_reason, s.version`;

interface RoundSql {
  id: string;
  group_id: string;
  cycle_id: string;
  period: string;
  round_number: number;
  status: RoundStatus;
  total_bs_cents: string;
  member_count_after: number;
  base_share_cents: string;
  owner_share_cents: string;
  shortfall_cents: string;
  opened_by: string;
  opened_at: Date;
  respond_by: Date;
  pay_by: Date;
  closed_at: Date | null;
  version: number;
}

interface RowSql {
  id: string;
  round_id: string;
  user_id: string;
  full_name: string;
  paid_cents: string;
  extra_due_cents: string;
  choice: Choice;
  responded_at: Date | null;
  extra_status: ExtraStatus;
  extra_method: 'qr' | 'transferencia' | null;
  extra_reference: string | null;
  extra_deadline_at: Date | null;
  extra_reject_reason: string | null;
  refund_status: RefundStatus;
  refund_amount_cents: string | null;
  refund_method: 'qr' | 'transferencia' | 'efectivo' | null;
  refund_reference: string | null;
  refund_due_at: Date | null;
  refund_dispute_reason: string | null;
  version: number;
}

const toRound = (row: RoundSql): RoundRecord => ({
  id: row.id,
  groupId: row.group_id,
  cycleId: row.cycle_id,
  period: row.period,
  roundNumber: row.round_number,
  status: row.status,
  totalBsCents: Number(row.total_bs_cents),
  memberCountAfter: row.member_count_after,
  baseShareCents: Number(row.base_share_cents),
  ownerShareCents: Number(row.owner_share_cents),
  shortfallCents: Number(row.shortfall_cents),
  openedBy: row.opened_by,
  openedAt: row.opened_at,
  respondBy: row.respond_by,
  payBy: row.pay_by,
  closedAt: row.closed_at,
  version: row.version,
});

const toRow = (row: RowSql): RowRecord => ({
  id: row.id,
  roundId: row.round_id,
  userId: row.user_id,
  fullName: row.full_name,
  paidCents: Number(row.paid_cents),
  extraDueCents: Number(row.extra_due_cents),
  choice: row.choice,
  respondedAt: row.responded_at,
  extraStatus: row.extra_status,
  extraMethod: row.extra_method,
  extraReference: row.extra_reference,
  extraDeadlineAt: row.extra_deadline_at,
  extraRejectReason: row.extra_reject_reason,
  refundStatus: row.refund_status,
  refundAmountCents: row.refund_amount_cents === null ? null : Number(row.refund_amount_cents),
  refundMethod: row.refund_method,
  refundReference: row.refund_reference,
  refundDueAt: row.refund_due_at,
  refundDisputeReason: row.refund_dispute_reason,
  version: row.version,
});

/**
 * Único lugar con SQL sobre `shortfall_rounds`, `shortfall_responses` y `shortfall_events` (0110)
 * y sobre los datos del ciclo y los pagos que alimentan la cotización (spec 011).
 */
@Injectable()
export class ShortfallsRepository {
  /** Último ciclo del grupo: el período que se regulariza (RF-011-01). */
  async latestCycle(q: Queryable, groupId: string): Promise<CycleRow | null> {
    const result = await q.query<{ id: string; period: string; total_bs_cents: string }>(
      `SELECT id, period, total_bs_cents::text AS total_bs_cents
         FROM billing_cycles
        WHERE group_id = $1
        ORDER BY period DESC, issued_at DESC
        LIMIT 1`,
      [groupId],
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, period: row.period, totalBsCents: Number(row.total_bs_cents) }
      : null;
  }

  /**
   * Lo pagado en el período por cada miembro activo que no es el titular y tiene su cobro
   * `pagado` (RF-011-02).
   */
  async paidByActiveMembers(q: Queryable, groupId: string, period: string): Promise<PaidRow[]> {
    const result = await q.query<{ user_id: string; full_name: string; paid: string }>(
      `SELECT c.user_id, u.full_name, sum(c.amount_cents)::text AS paid
         FROM charges c
         JOIN group_members m
           ON m.group_id = c.group_id AND m.user_id = c.user_id AND m.left_at IS NULL
         JOIN users u ON u.id = c.user_id
        WHERE c.group_id = $1 AND c.period = $2 AND c.status = 'pagado' AND m.role <> 'titular'
        GROUP BY c.user_id, u.full_name, m.joined_at
        ORDER BY m.joined_at, c.user_id`,
      [groupId, period],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      paidCents: Number(row.paid),
    }));
  }

  async countRoundsInPeriod(q: Queryable, groupId: string, period: string): Promise<number> {
    const result = await q.query<{ count: string }>(
      'SELECT count(*) AS count FROM shortfall_rounds WHERE group_id = $1 AND period = $2',
      [groupId, period],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findOpenRoundId(q: Queryable, groupId: string): Promise<string | null> {
    const result = await q.query<{ id: string }>(
      "SELECT id FROM shortfall_rounds WHERE group_id = $1 AND status = 'abierta'",
      [groupId],
    );
    return result.rows[0]?.id ?? null;
  }

  async insertRound(q: Queryable, round: NewRound): Promise<RoundRecord> {
    const result = await q.query<RoundSql>(
      `INSERT INTO shortfall_rounds AS r
         (group_id, cycle_id, period, round_number, total_bs_cents, member_count_after,
          base_share_cents, owner_share_cents, shortfall_cents, opened_by, opened_at, respond_by,
          pay_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${ROUND_COLUMNS}`,
      [
        round.groupId,
        round.cycleId,
        round.period,
        round.roundNumber,
        round.totalBsCents,
        round.memberCountAfter,
        round.baseShareCents,
        round.ownerShareCents,
        round.shortfallCents,
        round.openedBy,
        round.openedAt,
        round.respondBy,
        round.payBy,
      ],
    );
    return toRound(result.rows[0] as RoundSql);
  }

  async insertRow(q: Queryable, row: NewRow): Promise<string> {
    const result = await q.query<{ id: string }>(
      `INSERT INTO shortfall_responses (round_id, user_id, paid_cents, extra_due_cents)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [row.roundId, row.userId, row.paidCents, row.extraDueCents],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async findRound(q: Queryable, roundId: string, forUpdate = false): Promise<RoundRecord | null> {
    const result = await q.query<RoundSql>(
      `SELECT ${ROUND_COLUMNS} FROM shortfall_rounds r WHERE r.id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [roundId],
    );
    const row = result.rows[0];
    return row ? toRound(row) : null;
  }

  /** La ronda más reciente del grupo: la abierta, o si no hay, la última. */
  async findLatestRound(q: Queryable, groupId: string): Promise<RoundRecord | null> {
    const result = await q.query<RoundSql>(
      `SELECT ${ROUND_COLUMNS} FROM shortfall_rounds r
        WHERE r.group_id = $1
        ORDER BY (r.status = 'abierta') DESC, r.opened_at DESC
        LIMIT 1`,
      [groupId],
    );
    const row = result.rows[0];
    return row ? toRound(row) : null;
  }

  async closeRound(
    q: Queryable,
    roundId: string,
    status: 'cerrada' | 'cancelada',
    now: Date,
  ): Promise<void> {
    await q.query(
      `UPDATE shortfall_rounds SET status = $2, closed_at = $3, version = version + 1
        WHERE id = $1`,
      [roundId, status, now],
    );
  }

  async findRow(q: Queryable, rowId: string, forUpdate = false): Promise<RowRecord | null> {
    const result = await q.query<RowSql>(
      `SELECT ${ROW_COLUMNS} FROM shortfall_responses s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1${forUpdate ? ' FOR UPDATE OF s' : ''}`,
      [rowId],
    );
    const row = result.rows[0];
    return row ? toRow(row) : null;
  }

  async listRows(q: Queryable, roundId: string): Promise<RowRecord[]> {
    const result = await q.query<RowSql>(
      `SELECT ${ROW_COLUMNS} FROM shortfall_responses s JOIN users u ON u.id = s.user_id
        WHERE s.round_id = $1 ORDER BY s.created_at, s.id`,
      [roundId],
    );
    return result.rows.map(toRow);
  }

  /** Filas (y su ronda) de una persona, las más recientes primero (HU-011-02). */
  async listForUser(
    q: Queryable,
    userId: string,
  ): Promise<{ round: RoundRecord; row: RowRecord }[]> {
    const rows = await q.query<{ id: string; round_id: string }>(
      `SELECT id, round_id FROM shortfall_responses WHERE user_id = $1
        ORDER BY created_at DESC, id LIMIT 50`,
      [userId],
    );
    const out: { round: RoundRecord; row: RowRecord }[] = [];
    for (const item of rows.rows) {
      const [round, row] = await Promise.all([
        this.findRound(q, item.round_id),
        this.findRow(q, item.id),
      ]);
      if (round && row) out.push({ round, row });
    }
    return out;
  }

  /** Aplica el cambio y sube la versión. Devuelve la fila actualizada. */
  async updateRow(q: Queryable, rowId: string, patch: RowPatch): Promise<RowRecord> {
    const entries = Object.entries(patch) as [keyof RowPatch, unknown][];
    if (entries.length === 0) throw new Error('updateRow necesita al menos un cambio.');
    const sets = entries.map(([key], i) => `${PATCH_COLUMNS[key]} = $${i + 2}`);
    await q.query(
      `UPDATE shortfall_responses SET ${sets.join(', ')}, version = version + 1 WHERE id = $1`,
      [rowId, ...entries.map(([, value]) => value)],
    );
    return (await this.findRow(q, rowId)) as RowRecord;
  }

  /** Rondas abiertas con plazos vencidos o con devoluciones por disputar: las revisa el barrido. */
  async listSweepRoundIds(q: Queryable, now: Date, limit: number): Promise<string[]> {
    const result = await q.query<{ id: string }>(
      `SELECT r.id FROM shortfall_rounds r
        WHERE r.status = 'abierta'
          AND (r.respond_by <= $1
               OR EXISTS (SELECT 1 FROM shortfall_responses s
                           WHERE s.round_id = r.id AND s.extra_status = 'pendiente_pago'
                             AND s.extra_deadline_at <= $1)
               OR NOT EXISTS (SELECT 1 FROM shortfall_responses s
                               WHERE s.round_id = r.id
                                 AND (s.choice = 'pendiente' OR s.choice = 'cubrir'
                                      AND s.extra_status <> 'confirmado')))
        ORDER BY r.respond_by
        LIMIT $2`,
      [now, limit],
    );
    return result.rows.map((row) => row.id);
  }

  async insertEvent(q: Queryable, event: NewShortfallEvent): Promise<void> {
    await q.query(
      `INSERT INTO shortfall_events
         (round_id, response_id, type, actor_kind, actor_id, reason, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        event.roundId,
        event.responseId ?? null,
        event.type,
        event.actorId === null ? 'sistema' : 'usuario',
        event.actorId,
        event.reason ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.occurredAt,
      ],
    );
  }

  async listEvents(q: Queryable, roundId: string): Promise<TimelineRow[]> {
    const result = await q.query<{
      response_id: string | null;
      type: ShortfallEventType;
      actor_id: string | null;
      full_name: string | null;
      reason: string | null;
      occurred_at: Date;
    }>(
      `SELECT e.response_id, e.type, e.actor_id, u.full_name, e.reason, e.occurred_at
         FROM shortfall_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.round_id = $1
        ORDER BY e.occurred_at, e.created_at, e.id`,
      [roundId],
    );
    return result.rows.map((row) => ({
      responseId: row.response_id,
      type: row.type,
      actorId: row.actor_id,
      actorName: row.full_name,
      reason: row.reason,
      occurredAt: row.occurred_at,
    }));
  }

  /** Devoluciones disputadas, las más antiguas primero (cola de administración, spec 011 T017). */
  async listDisputedRefunds(q: Queryable, limit: number): Promise<DisputedRefundRecord[]> {
    const result = await q.query<{
      id: string;
      group_id: string;
      group_name: string;
      period: string;
      member_name: string;
      host_name: string;
      refund_amount_cents: string;
      refund_method: 'qr' | 'transferencia' | 'efectivo' | null;
      refund_reference: string | null;
      refund_dispute_reason: string;
      refund_disputed_at: Date;
    }>(
      `SELECT s.id, r.group_id, g.name AS group_name, r.period, m.full_name AS member_name,
              h.full_name AS host_name, s.refund_amount_cents::text AS refund_amount_cents,
              s.refund_method, s.refund_reference, s.refund_dispute_reason, s.refund_disputed_at
         FROM shortfall_responses s
         JOIN shortfall_rounds r ON r.id = s.round_id
         JOIN groups g ON g.id = r.group_id
         JOIN users m ON m.id = s.user_id
         JOIN users h ON h.id = g.owner_id
        WHERE s.refund_status = 'disputada'
        ORDER BY s.refund_disputed_at, s.id
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      rowId: row.id,
      groupId: row.group_id,
      groupName: row.group_name,
      period: row.period,
      memberName: row.member_name,
      hostName: row.host_name,
      refundAmountCents: Number(row.refund_amount_cents),
      refundMethod: row.refund_method,
      refundReference: row.refund_reference,
      disputeReason: row.refund_dispute_reason,
      disputedAt: row.refund_disputed_at,
    }));
  }
}
