import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface PlatformStats {
  users: { total: number; newThisMonth: number; active30d: number };
  groups: { active: number; closed: number };
  charges: {
    period: string;
    byStatus: Record<'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado', number>;
    managedCents: number;
  };
  punctualityRate: number | null;
  topServices: { name: string; groups: number }[];
  listings: { active: number };
  joinRequestsThisMonth: number;
  disputesOpen: number;
}

const n = (value: string | number | null | undefined): number => Number(value ?? 0);

/**
 * Consultas agregadas de la plataforma (spec 009, US7): solo conteos y sumas, nunca filas de
 * personas ni de cobros (RN-009-06). Cada una es un `count`/`sum` indexado por estado o período.
 */
@Injectable()
export class StatsRepository {
  async collect(
    q: Queryable,
    window: { period: string; monthStart: Date; since30d: Date },
  ): Promise<PlatformStats> {
    const [users, groups, charges, reputation, top, listings, requests, disputes] =
      await Promise.all([
        q.query<{ total: string; new_month: string; active: string }>(
          `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE created_at >= $1)::text AS new_month,
                count(*) FILTER (WHERE last_login_at >= $2)::text AS active
           FROM users`,
          [window.monthStart, window.since30d],
        ),
        q.query<{ status: string; total: string }>(
          `SELECT status, count(*)::text AS total FROM groups GROUP BY status`,
        ),
        q.query<{ status: string; total: string; cents: string }>(
          `SELECT status, count(*)::text AS total, COALESCE(sum(amount_cents), 0)::text AS cents
           FROM charges WHERE period = $1 GROUP BY status`,
          [window.period],
        ),
        q.query<{ punctual: string | null; considered: string | null }>(
          `SELECT sum(punctual_count)::text AS punctual, sum(considered_count)::text AS considered
           FROM user_reputation`,
        ),
        q.query<{ name: string; total: string }>(
          `SELECT service_name_snapshot AS name, count(*)::text AS total
           FROM groups WHERE status = 'activo'
          GROUP BY service_name_snapshot ORDER BY count(*) DESC, service_name_snapshot LIMIT 5`,
        ),
        q.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM listings WHERE status = 'activa'`,
        ),
        q.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM join_requests WHERE created_at >= $1`,
          [window.monthStart],
        ),
        q.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM join_disputes WHERE status = 'abierto'`,
        ),
      ]);

    const byStatus = { pendiente: 0, en_revision: 0, pagado: 0, atrasado: 0, cancelado: 0 };
    let managedCents = 0;
    for (const row of charges.rows) {
      if (row.status in byStatus) byStatus[row.status as keyof typeof byStatus] = n(row.total);
      if (row.status !== 'cancelado') managedCents += n(row.cents);
    }
    const considered = n(reputation.rows[0]?.considered);
    const punctual = n(reputation.rows[0]?.punctual);
    const groupCount = (status: string): number =>
      n(groups.rows.find((r) => r.status === status)?.total);

    return {
      users: {
        total: n(users.rows[0]?.total),
        newThisMonth: n(users.rows[0]?.new_month),
        active30d: n(users.rows[0]?.active),
      },
      groups: { active: groupCount('activo'), closed: groupCount('cerrado') },
      charges: { period: window.period, byStatus, managedCents },
      // Entero, mitad hacia arriba: floor((200p + c) / 2c).
      punctualityRate:
        considered === 0 ? null : Math.floor((200 * punctual + considered) / (2 * considered)),
      topServices: top.rows.map((r) => ({ name: r.name, groups: n(r.total) })),
      listings: { active: n(listings.rows[0]?.total) },
      joinRequestsThisMonth: n(requests.rows[0]?.total),
      disputesOpen: n(disputes.rows[0]?.total),
    };
  }
}
