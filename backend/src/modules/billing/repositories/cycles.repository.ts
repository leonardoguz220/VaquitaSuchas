import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { LaPazDate } from '../../subscriptions/domain/billing-calendar.js';
import type { Cycle, CycleType } from '../domain/cycle-calculation.js';

export interface CycleRecord extends Cycle {
  id: string;
  groupId: string;
  /** Solo el ciclo inicial puede estar abierto (`null`): se recalcula con cada ingreso o salida. */
  finalizedAt: Date | null;
}

interface CycleRow {
  id: string;
  group_id: string;
  period: string;
  owner_id: string;
  cycle_type: CycleType;
  cut_date: string;
  due_date: string;
  issued_at: Date;
  price_cents: string;
  currency: 'USD' | 'BS';
  exchange_rate: string | null;
  total_bs_cents: string;
  member_count: number;
  base_share_cents: string;
  owner_share_cents: string;
  remainder_cents: string;
  finalized_at: Date | null;
}

// `date` se pide como texto para no pasar por la zona horaria del servidor.
const COLUMNS = `id, group_id, period, owner_id, cycle_type,
  to_char(cut_date, 'YYYY-MM-DD') AS cut_date, to_char(due_date, 'YYYY-MM-DD') AS due_date,
  issued_at, price_cents::text AS price_cents, currency, exchange_rate::text AS exchange_rate,
  total_bs_cents::text AS total_bs_cents, member_count, base_share_cents::text AS base_share_cents,
  owner_share_cents::text AS owner_share_cents, remainder_cents::text AS remainder_cents,
  finalized_at`;

const parseDate = (iso: string): LaPazDate => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return { year, month, day };
};

const formatDate = (d: LaPazDate): string =>
  `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

const toRecord = (row: CycleRow): CycleRecord => ({
  id: row.id,
  groupId: row.group_id,
  period: row.period,
  ownerId: row.owner_id,
  cycleType: row.cycle_type,
  cutDate: parseDate(row.cut_date),
  dueDate: parseDate(row.due_date),
  issuedAt: row.issued_at,
  priceCents: Number(row.price_cents),
  currency: row.currency,
  exchangeRate: row.exchange_rate,
  totalBsCents: Number(row.total_bs_cents),
  memberCount: row.member_count,
  baseShareCents: Number(row.base_share_cents),
  ownerShareCents: Number(row.owner_share_cents),
  remainderCents: Number(row.remainder_cents),
  finalizedAt: row.finalized_at,
});

/** Único lugar con SQL sobre `billing_cycles` (0040_billing_cycles.sql). */
@Injectable()
export class CyclesRepository {
  /**
   * Inserta el ciclo. Devuelve `null` si ya existía uno del mismo grupo y período (RN-002-09) o si
   * el grupo ya tiene su ciclo inicial: la generación es idempotente (CA-002-22).
   * Un ciclo regular nace finalizado; el inicial queda abierto.
   */
  async insert(q: Queryable, groupId: string, cycle: Cycle): Promise<CycleRecord | null> {
    const result = await q.query<CycleRow>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, exchange_rate, total_bs_cents,
                                   member_count, base_share_cents, owner_share_cents,
                                   remainder_cents, finalized_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               CASE WHEN $4 = 'inicial' THEN NULL ELSE $7::timestamptz END)
       ON CONFLICT DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        groupId,
        cycle.period,
        cycle.ownerId,
        cycle.cycleType,
        formatDate(cycle.cutDate),
        formatDate(cycle.dueDate),
        cycle.issuedAt,
        cycle.priceCents,
        cycle.currency,
        cycle.exchangeRate,
        cycle.totalBsCents,
        cycle.memberCount,
        cycle.baseShareCents,
        cycle.ownerShareCents,
        cycle.remainderCents,
      ],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findById(q: Queryable, id: string): Promise<CycleRecord | null> {
    const result = await q.query<CycleRow>(`SELECT ${COLUMNS} FROM billing_cycles WHERE id = $1`, [
      id,
    ]);
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findByGroupAndPeriod(
    q: Queryable,
    groupId: string,
    period: string,
  ): Promise<CycleRecord | null> {
    const result = await q.query<CycleRow>(
      `SELECT ${COLUMNS} FROM billing_cycles WHERE group_id = $1 AND period = $2`,
      [groupId, period],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Último ciclo del grupo por período. */
  async findLatest(q: Queryable, groupId: string): Promise<CycleRecord | null> {
    const result = await q.query<CycleRow>(
      `SELECT ${COLUMNS} FROM billing_cycles WHERE group_id = $1 ORDER BY period DESC LIMIT 1`,
      [groupId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Ciclo inicial del grupo, abierto o ya finalizado. */
  async findInitial(q: Queryable, groupId: string): Promise<CycleRecord | null> {
    const result = await q.query<CycleRow>(
      `SELECT ${COLUMNS} FROM billing_cycles WHERE group_id = $1 AND cycle_type = 'inicial'`,
      [groupId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Recalcula las cuotas del ciclo inicial mientras esté abierto (spec 001 research R1). Devuelve
   * `false` si ya estaba finalizado: la base lo rechazaría y aquí ni se intenta.
   */
  async updateOpenInitialShares(
    q: Queryable,
    id: string,
    shares: {
      memberCount: number;
      baseShareCents: number;
      ownerShareCents: number;
      remainderCents: number;
    },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE billing_cycles
          SET member_count = $2, base_share_cents = $3, owner_share_cents = $4, remainder_cents = $5
        WHERE id = $1 AND cycle_type = 'inicial' AND finalized_at IS NULL`,
      [
        id,
        shares.memberCount,
        shares.baseShareCents,
        shares.ownerShareCents,
        shares.remainderCents,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Cierra el ciclo inicial abierto; `false` si ya estaba cerrado o no es inicial. */
  async finalizeInitial(q: Queryable, id: string, now: Date): Promise<boolean> {
    const result = await q.query(
      `UPDATE billing_cycles SET finalized_at = $2
        WHERE id = $1 AND cycle_type = 'inicial' AND finalized_at IS NULL`,
      [id, now],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
