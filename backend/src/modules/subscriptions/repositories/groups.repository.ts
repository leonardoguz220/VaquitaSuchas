import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface GroupRow {
  id: string;
  owner_id: string;
  name: string;
  status: 'activo' | 'cerrado';
  frozen_at: Date | null;
  frozen_reason: 'titular_baneado' | null;
  catalog_plan_id: string | null;
  plan_max_slots_snapshot: number | null;
  service_name_snapshot: string;
  plan_name_snapshot: string | null;
  logo_url_snapshot: string | null;
  brand_color_snapshot: string | null;
  price_cents: string;
  currency: 'USD' | 'BS';
  exchange_rate: string | null;
  total_bs_cents: string;
  billing_day: number;
  total_slots: number;
  invite_code: string;
  accepting_members: boolean;
  payment_info_text: string | null;
  version: number;
  created_at: Date;
}

const COLUMNS = `id, owner_id, name, status, frozen_at, frozen_reason, catalog_plan_id,
  plan_max_slots_snapshot, service_name_snapshot, plan_name_snapshot, logo_url_snapshot, brand_color_snapshot,
  price_cents::text AS price_cents, currency, exchange_rate::text AS exchange_rate,
  total_bs_cents::text AS total_bs_cents, billing_day, total_slots, invite_code,
  accepting_members, payment_info_text, version, created_at`;

export interface NewGroup {
  ownerId: string;
  name: string;
  serviceName: string;
  planName?: string | null;
  catalogPlanId?: string | null;
  planMaxSlots?: number | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  individualPriceCents?: number | null;
  individualPriceCurrency?: 'USD' | 'BS' | null;
  paymentInfoText?: string | null;
  priceCents: number;
  currency: 'USD' | 'BS';
  exchangeRate?: string | null;
  billingDay: number;
  totalSlots: number;
  inviteCode: string;
}

/** Único lugar con SQL sobre `groups` (0030_groups.sql). */
@Injectable()
export class GroupsRepository {
  async insert(q: Queryable, g: NewGroup): Promise<GroupRow> {
    const result = await q.query<GroupRow>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, plan_name_snapshot, catalog_plan_id,
                           plan_max_slots_snapshot, logo_url_snapshot, brand_color_snapshot,
                           individual_price_cents_snapshot, individual_price_currency_snapshot,
                           payment_info_text, price_cents, currency, exchange_rate,
                           billing_day, total_slots, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING ${COLUMNS}`,
      [
        g.ownerId,
        g.name,
        g.serviceName,
        g.planName ?? null,
        g.catalogPlanId ?? null,
        g.planMaxSlots ?? null,
        g.logoUrl ?? null,
        g.brandColor ?? null,
        g.individualPriceCents ?? null,
        g.individualPriceCurrency ?? null,
        g.paymentInfoText ?? null,
        g.priceCents,
        g.currency,
        g.exchangeRate ?? null,
        g.billingDay,
        g.totalSlots,
        g.inviteCode,
      ],
    );
    return result.rows[0] as GroupRow;
  }

  async findById(q: Queryable, groupId: string): Promise<GroupRow | null> {
    const result = await q.query<GroupRow>(`SELECT ${COLUMNS} FROM groups WHERE id = $1`, [
      groupId,
    ]);
    return result.rows[0] ?? null;
  }

  /** Grupo bloqueado con `FOR UPDATE` hasta el fin de la transacción (generación de ciclos, spec 002). */
  async findByIdForUpdate(q: Queryable, groupId: string): Promise<GroupRow | null> {
    const result = await q.query<GroupRow>(
      `SELECT ${COLUMNS} FROM groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    return result.rows[0] ?? null;
  }

  /** Ids de los grupos activos y no congelados: los únicos que generan cobros (spec 002, R5). */
  async listActiveUnfrozenIds(q: Queryable): Promise<string[]> {
    const result = await q.query<{ id: string }>(
      `SELECT id FROM groups WHERE status = 'activo' AND frozen_at IS NULL ORDER BY created_at, id`,
    );
    return result.rows.map((row) => row.id);
  }

  async findByInviteCode(q: Queryable, code: string): Promise<GroupRow | null> {
    const result = await q.query<GroupRow>(`SELECT ${COLUMNS} FROM groups WHERE invite_code = $1`, [
      code,
    ]);
    return result.rows[0] ?? null;
  }

  /** Grupos activos de los que la persona es titular (RN-001-14). */
  async countActiveOwned(q: Queryable, userId: string): Promise<number> {
    const result = await q.query<{ count: string }>(
      `SELECT count(*) AS count FROM groups WHERE owner_id = $1 AND status = 'activo'`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Serializa las altas y transferencias de un titular hasta el fin de la transacción: usa la misma
   * clave que el disparador `groups_max_active_owned`, así «contar y luego insertar» no tiene carrera.
   */
  async lockOwner(q: Queryable, ownerId: string): Promise<void> {
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [ownerId]);
  }

  /** Reemplaza el código en una sentencia; el anterior deja de existir. */
  async replaceInviteCode(q: Queryable, groupId: string, code: string): Promise<boolean> {
    const result = await q.query(
      'UPDATE groups SET invite_code = $2, version = version + 1 WHERE id = $1',
      [groupId, code],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Guarda los campos editables y sube `version` en una sentencia (RF-001-14). */
  async update(
    q: Queryable,
    groupId: string,
    g: {
      name: string;
      priceCents: number;
      currency: 'USD' | 'BS';
      exchangeRate: string | null;
      billingDay: number;
      totalSlots: number;
      acceptingMembers: boolean;
    },
  ): Promise<GroupRow> {
    const result = await q.query<GroupRow>(
      `UPDATE groups SET name = $2, price_cents = $3, currency = $4, exchange_rate = $5,
                         billing_day = $6, total_slots = $7, accepting_members = $8,
                         version = version + 1
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [
        groupId,
        g.name,
        g.priceCents,
        g.currency,
        g.currency === 'USD' ? g.exchangeRate : null,
        g.billingDay,
        g.totalSlots,
        g.acceptingMembers,
      ],
    );
    return result.rows[0] as GroupRow;
  }

  async setOwner(q: Queryable, groupId: string, ownerId: string): Promise<void> {
    await q.query('UPDATE groups SET owner_id = $2, version = version + 1 WHERE id = $1', [
      groupId,
      ownerId,
    ]);
  }

  async setAcceptingMembers(q: Queryable, groupId: string, accepting: boolean): Promise<void> {
    await q.query('UPDATE groups SET accepting_members = $2, version = version + 1 WHERE id = $1', [
      groupId,
      accepting,
    ]);
  }

  async close(q: Queryable, groupId: string, now: Date): Promise<boolean> {
    const result = await q.query(
      `UPDATE groups SET status = 'cerrado', closed_at = $2, version = version + 1
        WHERE id = $1 AND status = 'activo'`,
      [groupId, now],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
