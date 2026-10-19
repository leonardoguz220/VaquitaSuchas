import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ChargeStatus } from '../domain/charge-state.js';
import type { ChargeDraft } from '../domain/cycle-calculation.js';
import type { EntryChargeDraft } from '../domain/entry-charge.js';

export type ChargeOrigin = 'ciclo' | 'ingreso';
export type Settlement = 'comprobante' | 'manual' | 'ingreso';

export interface ChargeRecord {
  id: string;
  groupId: string;
  userId: string;
  cycleId: string;
  period: string;
  origin: ChargeOrigin;
  joinRequestId: string | null;
  status: ChargeStatus;
  amountCents: number;
  priceCents: number;
  currency: 'USD' | 'BS';
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  issuedAt: Date;
  dueAt: Date;
  firstSubmittedAt: Date | null;
  paidAt: Date | null;
  settledBy: string | null;
  settlement: Settlement | null;
  manualNote: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  version: number;
}

interface ChargeRow {
  id: string;
  group_id: string;
  user_id: string;
  cycle_id: string;
  period: string;
  origin: ChargeOrigin;
  join_request_id: string | null;
  status: ChargeStatus;
  amount_cents: string;
  price_cents: string;
  currency: 'USD' | 'BS';
  exchange_rate: string | null;
  total_bs_cents: string;
  member_count: number;
  issued_at: Date;
  due_at: Date;
  first_submitted_at: Date | null;
  paid_at: Date | null;
  settled_by: string | null;
  settlement: Settlement | null;
  manual_note: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  version: number;
}

const COLUMNS = `id, group_id, user_id, cycle_id, period, origin, join_request_id, status,
  amount_cents::text AS amount_cents, price_cents::text AS price_cents, currency,
  exchange_rate::text AS exchange_rate, total_bs_cents::text AS total_bs_cents, member_count,
  issued_at, due_at, first_submitted_at, paid_at, settled_by, settlement, manual_note,
  cancelled_at, cancelled_by, cancel_reason, version`;

const toRecord = (row: ChargeRow): ChargeRecord => ({
  id: row.id,
  groupId: row.group_id,
  userId: row.user_id,
  cycleId: row.cycle_id,
  period: row.period,
  origin: row.origin,
  joinRequestId: row.join_request_id,
  status: row.status,
  amountCents: Number(row.amount_cents),
  priceCents: Number(row.price_cents),
  currency: row.currency,
  exchangeRate: row.exchange_rate,
  totalBsCents: Number(row.total_bs_cents),
  memberCount: row.member_count,
  issuedAt: row.issued_at,
  dueAt: row.due_at,
  firstSubmittedAt: row.first_submitted_at,
  paidAt: row.paid_at,
  settledBy: row.settled_by,
  settlement: row.settlement,
  manualNote: row.manual_note,
  cancelledAt: row.cancelled_at,
  cancelledBy: row.cancelled_by,
  cancelReason: row.cancel_reason,
  version: row.version,
});

export interface MyChargesFilter {
  userId: string;
  statuses: readonly ChargeStatus[];
  period: string | null;
  groupId: string | null;
  /** Se piden `limit + 1` filas para saber si hay otra página. */
  limit: number;
  after: { dueAt: Date; id: string } | null;
}

/** Filtros del historial del grupo (RF-002-17); `after` es la posición del cursor. */
export interface GroupHistoryFilter {
  groupId: string;
  period: string | null;
  statuses: readonly ChargeStatus[];
  userId: string | null;
  /** Se piden `limit + 1` filas para saber si hay otra página. */
  limit: number;
  after: { period: string; issuedAt: Date; id: string } | null;
}

/** Columnas que acompañan a un cambio de estado; las ausentes (`undefined`) no se tocan. */
export interface ChargeStatusPatch {
  /** Se fija con la primera subida y no cambia después (RN-002-08). */
  firstSubmittedAt?: Date;
  paidAt?: Date;
  settledBy?: string;
  settlement?: Settlement;
  manualNote?: string | null;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
}

/** Único lugar con SQL sobre `charges` (0041_charges.sql, 0043_charge_triggers.sql). */
@Injectable()
export class ChargesRepository {
  /**
   * Inserta un cobro del ciclo (RF-002-04). Devuelve `null` si el miembro ya tiene un cobro no
   * cancelado en el período: la generación es idempotente (CA-002-22, CA-002-24).
   */
  async insertFromCycle(
    q: Queryable,
    groupId: string,
    cycleId: string,
    draft: ChargeDraft,
  ): Promise<ChargeRecord | null> {
    const result = await q.query<ChargeRow>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                            price_cents, currency, exchange_rate, total_bs_cents, member_count,
                            issued_at, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (group_id, user_id, period) WHERE status <> 'cancelado' DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        groupId,
        draft.userId,
        cycleId,
        draft.period,
        draft.origin,
        draft.status,
        draft.amountCents,
        draft.priceCents,
        draft.currency,
        draft.exchangeRate,
        draft.totalBsCents,
        draft.memberCount,
        draft.issuedAt,
        draft.dueAt,
      ],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Inserta el cobro de ingreso, ya `pagado` (RF-002-19). Devuelve `null` si la persona ya tiene un
   * cobro no cancelado en el período (CA-002-24).
   */
  async insertEntry(
    q: Queryable,
    groupId: string,
    cycleId: string,
    joinRequestId: string,
    settledBy: string,
    draft: EntryChargeDraft,
  ): Promise<ChargeRecord | null> {
    const result = await q.query<ChargeRow>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, join_request_id, status,
                            amount_cents, price_cents, currency, exchange_rate, total_bs_cents,
                            member_count, issued_at, due_at, paid_at, settled_by, settlement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (group_id, user_id, period) WHERE status <> 'cancelado' DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        groupId,
        draft.userId,
        cycleId,
        draft.period,
        draft.origin,
        joinRequestId,
        draft.status,
        draft.amountCents,
        draft.priceCents,
        draft.currency,
        draft.exchangeRate,
        draft.totalBsCents,
        draft.memberCount,
        draft.issuedAt,
        draft.dueAt,
        draft.paidAt,
        settledBy,
        draft.settlement,
      ],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findById(q: Queryable, id: string): Promise<ChargeRecord | null> {
    const result = await q.query<ChargeRow>(`SELECT ${COLUMNS} FROM charges WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Cobro bloqueado con `FOR UPDATE` hasta el fin de la transacción: toda transición lo lee así
   * antes de llamar a `transition()` (plan §2 y §5; dos titulares o una subida y una cancelación
   * simultáneas se serializan).
   */
  async findByIdForUpdate(q: Queryable, id: string): Promise<ChargeRecord | null> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Cobro no cancelado del miembro en el período, si existe. */
  async findActiveByMemberPeriod(
    q: Queryable,
    groupId: string,
    userId: string,
    period: string,
  ): Promise<ChargeRecord | null> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges
        WHERE group_id = $1 AND user_id = $2 AND period = $3 AND status <> 'cancelado'`,
      [groupId, userId, period],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Cobros de un período del grupo (resumen del titular, RF-002-16), por miembro. */
  async listByGroupPeriod(q: Queryable, groupId: string, period: string): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges WHERE group_id = $1 AND period = $2
        ORDER BY issued_at, id`,
      [groupId, period],
    );
    return result.rows.map(toRecord);
  }

  /**
   * Historial del grupo (RF-002-17): período y emisión descendentes, con desempate por `id`.
   * `statuses` vacío = todos.
   */
  async listGroupHistory(q: Queryable, filter: GroupHistoryFilter): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges
        WHERE group_id = $1
          AND ($2::text IS NULL OR period = $2)
          AND (cardinality($3::text[]) = 0 OR status = ANY($3::text[]))
          AND ($4::uuid IS NULL OR user_id = $4)
          AND ($5::text IS NULL OR (period, issued_at, id) < ($5::text, $6::timestamptz, $7::uuid))
        ORDER BY period DESC, issued_at DESC, id DESC
        LIMIT $8`,
      [
        filter.groupId,
        filter.period,
        [...filter.statuses],
        filter.userId,
        filter.after?.period ?? null,
        filter.after?.issuedAt ?? null,
        filter.after?.id ?? null,
        filter.limit,
      ],
    );
    return result.rows.map(toRecord);
  }

  /** Cobros de una persona, los más recientes primero (RF-002-15). `statuses` vacío = todos. */
  async listByUser(
    q: Queryable,
    userId: string,
    statuses: readonly ChargeStatus[] = [],
  ): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges
        WHERE user_id = $1 AND (cardinality($2::text[]) = 0 OR status = ANY($2::text[]))
        ORDER BY due_at DESC, id`,
      [userId, [...statuses]],
    );
    return result.rows.map(toRecord);
  }

  /**
   * "Mis cobros" (RF-002-15, CA-002-32): los de la persona, `due_at` descendente con desempate por
   * `id`. De un grupo que ya dejó solo se ven los `atrasado` y `en_revision` (RN-002-11).
   */
  async listMine(q: Queryable, filter: MyChargesFilter): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges
        WHERE user_id = $1
          AND (cardinality($2::text[]) = 0 OR status = ANY($2::text[]))
          AND ($3::text IS NULL OR period = $3)
          AND ($4::uuid IS NULL OR group_id = $4)
          AND (status IN ('atrasado', 'en_revision')
               OR EXISTS (SELECT 1 FROM group_members gm
                           WHERE gm.group_id = charges.group_id AND gm.user_id = charges.user_id
                             AND gm.left_at IS NULL))
          AND ($5::timestamptz IS NULL OR (due_at, id) < ($5::timestamptz, $6::uuid))
        ORDER BY due_at DESC, id DESC
        LIMIT $7`,
      [
        filter.userId,
        [...filter.statuses],
        filter.period,
        filter.groupId,
        filter.after?.dueAt ?? null,
        filter.after?.id ?? null,
        filter.limit,
      ],
    );
    return result.rows.map(toRecord);
  }

  /** Cobros del ciclo, para revisar qué miembros ya fueron cobrados. */
  async listByCycle(q: Queryable, cycleId: string): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges WHERE cycle_id = $1 ORDER BY issued_at, id`,
      [cycleId],
    );
    return result.rows.map(toRecord);
  }

  /**
   * Cobros `pendiente` ya vencidos (`due_at <= now`) para el barrido de atrasos (RN-002-04). Con
   * `groupId` se limita a un grupo. Las filas se bloquean (`FOR UPDATE SKIP LOCKED`) para que dos
   * barridos simultáneos no procesen el mismo cobro.
   */
  async listOverdueForUpdate(
    q: Queryable,
    now: Date,
    groupId: string | null = null,
  ): Promise<ChargeRecord[]> {
    const result = await q.query<ChargeRow>(
      `SELECT ${COLUMNS} FROM charges
        WHERE status = 'pendiente' AND due_at <= $1 AND ($2::uuid IS NULL OR group_id = $2)
        ORDER BY due_at, id
        FOR UPDATE SKIP LOCKED`,
      [now, groupId],
    );
    return result.rows.map(toRecord);
  }

  /**
   * ¿Hay cobros `pendiente` vencidos en un grupo activo y no congelado? Consulta barata por
   * `charges_overdue_idx` que decide si hace falta abrir el barrido (research R2, R5): un grupo
   * cerrado o congelado nunca cuenta.
   */
  async existsOverdueInActiveGroup(q: Queryable, now: Date, groupId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM charges c JOIN groups g ON g.id = c.group_id
        WHERE c.group_id = $2 AND c.status = 'pendiente' AND c.due_at <= $1
          AND g.status = 'activo' AND g.frozen_at IS NULL
        LIMIT 1`,
      [now, groupId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Grupos activos y no congelados con cobros `pendiente` vencidos, opcionalmente de una persona. */
  async listOverdueGroupIds(
    q: Queryable,
    now: Date,
    userId: string | null = null,
  ): Promise<string[]> {
    const result = await q.query<{ group_id: string }>(
      `SELECT DISTINCT c.group_id FROM charges c JOIN groups g ON g.id = c.group_id
        WHERE c.status = 'pendiente' AND c.due_at <= $1 AND ($2::uuid IS NULL OR c.user_id = $2)
          AND g.status = 'activo' AND g.frozen_at IS NULL
        ORDER BY c.group_id`,
      [now, userId],
    );
    return result.rows.map((row) => row.group_id);
  }

  /** ¿La persona tiene algún cobro `atrasado` (deuda, spec 010)? */
  async hasOverdue(q: Queryable, userId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM charges WHERE user_id = $1 AND status = 'atrasado' LIMIT 1`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Aplica una transición ya decidida por `transition()`. `version` sube en 1 (también lo fija el
   * disparador 0043). Llamar con el cobro bloqueado por `findByIdForUpdate`. Devuelve el cobro
   * actualizado.
   */
  async updateStatus(
    q: Queryable,
    id: string,
    status: ChargeStatus,
    patch: ChargeStatusPatch = {},
  ): Promise<ChargeRecord> {
    const result = await q.query<ChargeRow>(
      `UPDATE charges
          SET status = $2,
              first_submitted_at = COALESCE(first_submitted_at, $3),
              paid_at = COALESCE($4, paid_at),
              settled_by = COALESCE($5, settled_by),
              settlement = COALESCE($6, settlement),
              manual_note = COALESCE($7, manual_note),
              cancelled_at = COALESCE($8, cancelled_at),
              cancelled_by = COALESCE($9, cancelled_by),
              cancel_reason = COALESCE($10, cancel_reason),
              version = version + 1
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [
        id,
        status,
        patch.firstSubmittedAt ?? null,
        patch.paidAt ?? null,
        patch.settledBy ?? null,
        patch.settlement ?? null,
        patch.manualNote ?? null,
        patch.cancelledAt ?? null,
        patch.cancelledBy ?? null,
        patch.cancelReason ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('El cobro a actualizar no existe.');
    return toRecord(row);
  }
}
