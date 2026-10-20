import { randomInt } from 'node:crypto';
import { splitShares } from '../../src/modules/subscriptions/domain/shares.js';
import type { BillingHarness } from './billing-harness.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface ReportsGroup {
  id: string;
  ownerId: string;
  memberIds: string[];
  totalBsCents: number;
}

export interface ReportsGroupOptions {
  ownerId: string;
  memberIds: string[];
  name?: string;
  serviceName?: string;
  totalBsCents?: number;
  /** Precio individual de referencia copiado en el grupo (RN-001-12). */
  individual?: { cents: number; currency: 'BS' | 'USD' };
  billingDay?: number;
}

export interface ReportsChargeOptions {
  period?: string;
  amountCents?: number;
  status?: 'pendiente' | 'en_revision' | 'atrasado' | 'pagado' | 'cancelado';
  dueAt?: string;
}

/** Datos de prueba de la spec 006: grupos, ciclos y cobros con montos y estados a medida. */
export class ReportsFixtures {
  private readonly cycles = new Map<string, string>();

  constructor(private readonly harness: BillingHarness) {}

  async createGroup(options: ReportsGroupOptions): Promise<ReportsGroup> {
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const total = options.totalBsCents ?? 9000;
    const client = await this.harness.pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query<{ id: string }>(
        `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                             billing_day, total_slots, invite_code,
                             individual_price_cents_snapshot, individual_price_currency_snapshot)
         VALUES ($1, $2, $3, $4, 'BS', $5, 5, $6, $7, $8) RETURNING id`,
        [
          options.ownerId,
          options.name ?? 'Grupo',
          options.serviceName ?? 'Servicio',
          total,
          options.billingDay ?? 15,
          code,
          options.individual?.cents ?? null,
          options.individual?.currency ?? null,
        ],
      );
      const id = (group.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'titular', 'creacion')`,
        [id, options.ownerId],
      );
      for (const userId of options.memberIds) {
        await client.query(
          `INSERT INTO group_members (group_id, user_id, role, join_source)
           VALUES ($1, $2, 'miembro', 'creacion')`,
          [id, userId],
        );
      }
      await client.query('COMMIT');
      return { id, ownerId: options.ownerId, memberIds: options.memberIds, totalBsCents: total };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Ciclo regular del período (uno por grupo y período). Con `usd`, el precio está en USD y el
   * total en Bs es `round(precio × tipo de cambio)`; si no, el total del grupo en Bs.
   */
  async cycle(
    group: ReportsGroup,
    period: string,
    options: {
      usd?: { priceCents: number; rate: number };
      totalBsCents?: number;
      /** Cuota base deseada: el total del ciclo es `base × miembros` (sin resto). */
      baseShareCents?: number;
    } = {},
  ): Promise<string> {
    const key = `${group.id}:${period}`;
    const existing = this.cycles.get(key);
    if (existing) return existing;
    const total = options.usd
      ? Math.round(options.usd.priceCents * options.usd.rate)
      : (options.totalBsCents ??
        (options.baseShareCents === undefined
          ? group.totalBsCents
          : options.baseShareCents * (group.memberIds.length + 1)));
    const shares = splitShares(total, group.memberIds.length + 1);
    const cut = `${period}-15`;
    const due = `${period}-18`;
    const result = await this.harness.pool.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, exchange_rate, total_bs_cents,
                                   member_count, base_share_cents, owner_share_cents,
                                   remainder_cents, finalized_at)
       VALUES ($1, $2, $3, 'regular', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $6)
       RETURNING id`,
      [
        group.id,
        period,
        group.ownerId,
        cut,
        due,
        `${cut}T04:00:00Z`,
        options.usd ? options.usd.priceCents : total,
        options.usd ? 'USD' : 'BS',
        options.usd ? options.usd.rate : null,
        total,
        group.memberIds.length + 1,
        shares.baseShareCents,
        shares.ownerShareCents,
        shares.remainderCents,
      ],
    );
    const id = (result.rows[0] as { id: string }).id;
    this.cycles.set(key, id);
    return id;
  }

  /** Cobro del miembro con monto y estado a medida (crea el ciclo del período si hace falta). */
  async charge(
    group: ReportsGroup,
    userId: string,
    options: ReportsChargeOptions = {},
  ): Promise<string> {
    const period = options.period ?? '2026-10';
    const cycleId = await this.cycle(group, period, { baseShareCents: options.amountCents });
    // El cobro copia al ciclo (disparador de coherencia): el monto es su cuota base.
    const snapshot = await this.harness.pool.query<{
      price_cents: string;
      currency: string;
      exchange_rate: string | null;
      total_bs_cents: string;
      member_count: number;
      base_share_cents: string;
    }>(`SELECT * FROM billing_cycles WHERE id = $1`, [cycleId]);
    const cycle = snapshot.rows[0] as (typeof snapshot.rows)[number];
    if (
      options.amountCents !== undefined &&
      Number(cycle.base_share_cents) !== options.amountCents
    ) {
      throw new Error(`El ciclo ${period} ya existe con otra cuota base.`);
    }
    const result = await this.harness.pool.query<{ id: string }>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                            price_cents, currency, exchange_rate, total_bs_cents, member_count,
                            issued_at, due_at)
       VALUES ($1, $2, $3, $4, 'ciclo', 'pendiente', $5, $6, $7, $8, $9, $10, $11::timestamptz, $12)
       RETURNING id`,
      [
        group.id,
        userId,
        cycleId,
        period,
        cycle.base_share_cents,
        cycle.price_cents,
        cycle.currency,
        cycle.exchange_rate,
        cycle.total_bs_cents,
        cycle.member_count,
        `${period}-15T04:00:00Z`,
        options.dueAt ?? `${period}-19T04:00:00Z`,
      ],
    );
    const id = (result.rows[0] as { id: string }).id;
    const pool = this.harness.pool;
    switch (options.status) {
      case 'en_revision':
        await pool.query(
          `UPDATE charges SET status = 'en_revision', first_submitted_at = now() WHERE id = $1`,
          [id],
        );
        break;
      case 'atrasado':
        await pool.query(`UPDATE charges SET status = 'atrasado' WHERE id = $1`, [id]);
        break;
      case 'pagado':
        await pool.query(
          `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
                              settlement = 'manual' WHERE id = $1`,
          [id, group.ownerId],
        );
        break;
      case 'cancelado':
        await pool.query(
          `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                              cancel_reason = 'Cancelado en la prueba' WHERE id = $1`,
          [id, group.ownerId],
        );
        break;
      default:
    }
    return id;
  }
}
