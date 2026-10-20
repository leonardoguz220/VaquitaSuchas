import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface ScheduleGroupRow {
  id: string;
  name: string;
  billingDay: number;
  totalBsCents: number;
  /** Miembros activos con el titular. */
  memberCount: number;
  /** Miembros activos sin el titular. */
  memberIds: string[];
}

export interface ScheduleChargeRow {
  id: string;
  groupId: string;
  groupName: string;
  userId: string;
  ownerId: string;
  status: 'pendiente' | 'en_revision';
  amountCents: number;
  dueAt: Date;
  memberName: string;
  receipt: { id: string; uploadedAt: Date } | null;
}

/** Lecturas de solo consulta de la tarea `notifications.schedule`. */
@Injectable()
export class ScheduleRepository {
  /** Grupos activos y no congelados con sus miembros activos. */
  async activeGroups(q: Queryable): Promise<ScheduleGroupRow[]> {
    const result = await q.query<{
      id: string;
      name: string;
      billing_day: number;
      total_bs_cents: string | null;
      member_count: string;
      member_ids: string[];
    }>(
      `SELECT g.id, g.name, g.billing_day, g.total_bs_cents,
              count(m.user_id) AS member_count,
              COALESCE(array_agg(m.user_id) FILTER (WHERE m.role <> 'titular'), '{}') AS member_ids
         FROM groups g
         JOIN group_members m ON m.group_id = g.id AND m.left_at IS NULL
        WHERE g.status = 'activo' AND g.frozen_at IS NULL
        GROUP BY g.id`,
    );
    return result.rows
      .filter((r) => r.total_bs_cents !== null)
      .map((r) => ({
        id: r.id,
        name: r.name,
        billingDay: Number(r.billing_day),
        totalBsCents: Number(r.total_bs_cents),
        memberCount: Number(r.member_count),
        memberIds: r.member_ids,
      }));
  }

  private static readonly CHARGE_SELECT = `SELECT c.id, c.group_id, g.name AS group_name, c.user_id,
         g.owner_id, c.status, c.amount_cents, c.due_at, u.full_name,
         r.id AS receipt_id, r.uploaded_at
    FROM charges c
    JOIN groups g ON g.id = c.group_id AND g.status = 'activo' AND g.frozen_at IS NULL
    JOIN group_members m ON m.group_id = c.group_id AND m.user_id = c.user_id AND m.left_at IS NULL
    JOIN users u ON u.id = c.user_id
    LEFT JOIN receipts r ON r.charge_id = c.id AND r.status = 'vigente'`;

  /** Cobros `pendiente` que vencen dentro de `withinMs` (el dominio decide el momento exacto). */
  chargesPendingDueWithin(q: Queryable, now: Date, withinMs: number): Promise<ScheduleChargeRow[]> {
    return this.charges(
      q,
      `${ScheduleRepository.CHARGE_SELECT}
       WHERE c.status = 'pendiente' AND c.due_at > $1
         AND c.due_at <= $1::timestamptz + ($2::double precision * interval '1 millisecond')`,
      [now, withinMs],
    );
  }

  /** Cobros en revisión con comprobante vigente subido hace al menos `olderThanMs`. */
  chargesInReviewOlderThan(
    q: Queryable,
    now: Date,
    olderThanMs: number,
  ): Promise<ScheduleChargeRow[]> {
    return this.charges(
      q,
      `${ScheduleRepository.CHARGE_SELECT}
       WHERE c.status = 'en_revision' AND r.id IS NOT NULL
         AND r.uploaded_at <= $1::timestamptz - ($2::double precision * interval '1 millisecond')`,
      [now, olderThanMs],
    );
  }

  private async charges(
    q: Queryable,
    sql: string,
    params: unknown[],
  ): Promise<ScheduleChargeRow[]> {
    const result = await q.query<{
      id: string;
      group_id: string;
      group_name: string;
      user_id: string;
      owner_id: string;
      status: 'pendiente' | 'en_revision';
      amount_cents: string;
      due_at: Date;
      full_name: string;
      receipt_id: string | null;
      uploaded_at: Date | null;
    }>(sql, params);
    return result.rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: r.group_name,
      userId: r.user_id,
      ownerId: r.owner_id,
      status: r.status,
      amountCents: Number(r.amount_cents),
      dueAt: r.due_at,
      memberName: r.full_name,
      receipt:
        r.receipt_id && r.uploaded_at ? { id: r.receipt_id, uploadedAt: r.uploaded_at } : null,
    }));
  }
}
