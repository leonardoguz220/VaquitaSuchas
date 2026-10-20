import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ListCursor } from '../domain/list-cursor.js';

export type ChargeListKind = 'debts' | 'in_review' | 'owed';

export interface SpendRow {
  groupId: string;
  groupName: string;
  serviceName: string;
  logoUrl: string | null;
  role: 'miembro' | 'titular';
  costCents: number;
  /** `null` para el titular: su cuota es de referencia (RN-006-02). */
  paidCents: number | null;
  individualPriceBsCents: number | null;
}

export interface DebtTotals {
  debtCents: number;
  debtCount: number;
  inReviewCents: number;
  inReviewCount: number;
}

export interface OwedGroupRow {
  groupId: string;
  groupName: string;
  serviceName: string;
  totalCents: number;
  count: number;
}

export interface CollectionRow {
  groupId: string;
  groupName: string;
  serviceName: string;
  period: string;
  expectedCents: number;
  collectedCents: number;
  inReviewCents: number;
  pendingCents: number;
}

export interface LateMemberRow {
  groupId: string;
  userId: string;
  fullName: string;
  chargeId: string;
  amountCents: number;
  dueAt: Date;
}

export interface MonthlyRow {
  period: string;
  totalCents: number;
  paidCents: number;
}

export interface SavingsMonthRow {
  period: string;
  individualPriceBsCents: number | null;
  shareCents: number;
}

export interface ChargeLineRow {
  chargeId: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  period: string;
  memberName: string | null;
  amountCents: number;
  status: 'pendiente' | 'atrasado' | 'en_revision';
  dueAt: Date;
}

export interface ListChargesQuery {
  kind: ChargeListKind;
  userId: string;
  groupId: string | null;
  /** Se pide una fila de más para saber si hay otra página. */
  limit: number;
  after: ListCursor | null;
}

const num = (value: string | number | null): number => Number(value ?? 0);
const numOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

/**
 * Consultas de solo lectura del panel y los reportes (spec 006). Usa las vistas `v_user_cost_lines`
 * y `v_group_collection` y agregados sobre `charges`; todo es entero en centavos y cada consulta
 * recibe el `userId` del token, nunca de la ruta o el cuerpo (RNF-006-03).
 */
@Injectable()
export class ReportsRepository {
  /** Gasto del período por grupo y rol (RN-006-02), con el precio individual de referencia en Bs. */
  async spendLines(
    q: Queryable,
    userId: string,
    period: string,
    groupId: string | null,
  ): Promise<SpendRow[]> {
    const result = await q.query<{
      group_id: string;
      name: string;
      service_name_snapshot: string;
      logo_url_snapshot: string | null;
      role: 'miembro' | 'titular';
      cost: string;
      paid: string | null;
      individual: string | null;
    }>(
      `SELECT v.group_id, g.name, g.service_name_snapshot, g.logo_url_snapshot, v.role,
              sum(v.cost_cents)::bigint AS cost,
              sum(v.paid_cents)::bigint AS paid,
              max(v.individual_price_bs_cents)::bigint AS individual
         FROM v_user_cost_lines v
         JOIN groups g ON g.id = v.group_id
        WHERE v.user_id = $1 AND v.period = $2 AND ($3::uuid IS NULL OR v.group_id = $3)
        GROUP BY v.group_id, g.name, g.service_name_snapshot, g.logo_url_snapshot, v.role
        ORDER BY g.service_name_snapshot, g.name, v.group_id`,
      [userId, period, groupId],
    );
    return result.rows.map((r) => ({
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      logoUrl: r.logo_url_snapshot,
      role: r.role,
      costCents: num(r.cost),
      paidCents: numOrNull(r.paid),
      individualPriceBsCents: numOrNull(r.individual),
    }));
  }

  /** Meses con ciclos o cobros de la persona, del más reciente al más antiguo. */
  async availableMonths(q: Queryable, userId: string): Promise<string[]> {
    const result = await q.query<{ period: string }>(
      `SELECT DISTINCT period FROM v_user_cost_lines WHERE user_id = $1 ORDER BY period DESC`,
      [userId],
    );
    return result.rows.map((r) => r.period);
  }

  /** Deudas (`pendiente` + `atrasado`) y cobros en revisión de todos los períodos (RN-006-04). */
  async debtTotals(q: Queryable, userId: string): Promise<DebtTotals> {
    const result = await q.query<{ in_review: boolean; cents: string; total: string }>(
      `SELECT (status = 'en_revision') AS in_review,
              sum(amount_cents)::bigint AS cents, count(*)::integer AS total
         FROM charges
        WHERE user_id = $1 AND status IN ('pendiente', 'atrasado', 'en_revision')
        GROUP BY (status = 'en_revision')`,
      [userId],
    );
    const totals: DebtTotals = { debtCents: 0, debtCount: 0, inReviewCents: 0, inReviewCount: 0 };
    for (const row of result.rows) {
      if (row.in_review) {
        totals.inReviewCents = num(row.cents);
        totals.inReviewCount = num(row.total);
      } else {
        totals.debtCents = num(row.cents);
        totals.debtCount = num(row.total);
      }
    }
    return totals;
  }

  /** `true` si la persona es titular de algún grupo (cualquier estado). */
  async isOwnerOfAnyGroup(q: Queryable, userId: string): Promise<boolean> {
    const result = await q.query(`SELECT 1 FROM groups WHERE owner_id = $1 LIMIT 1`, [userId]);
    return result.rows.length > 0;
  }

  /** «Me deben» por grupo: cobros `pendiente`, `atrasado` y `en_revision` de los miembros (RN-006-05). */
  async owedByGroup(q: Queryable, ownerId: string): Promise<OwedGroupRow[]> {
    const result = await q.query<{
      group_id: string;
      name: string;
      service_name_snapshot: string;
      cents: string;
      total: string;
    }>(
      `SELECT c.group_id, g.name, g.service_name_snapshot,
              sum(c.amount_cents)::bigint AS cents, count(*)::integer AS total
         FROM charges c
         JOIN groups g ON g.id = c.group_id
        WHERE g.owner_id = $1 AND c.status IN ('pendiente', 'atrasado', 'en_revision')
        GROUP BY c.group_id, g.name, g.service_name_snapshot
        ORDER BY g.service_name_snapshot, g.name, c.group_id`,
      [ownerId],
    );
    return result.rows.map((r) => ({
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      totalCents: num(r.cents),
      count: num(r.total),
    }));
  }

  /** Cobranza del período de los grupos de los que la persona es titular (RF-006-06). */
  async collectionForOwner(
    q: Queryable,
    ownerId: string,
    period: string,
    groupId: string | null,
  ): Promise<CollectionRow[]> {
    const result = await q.query<{
      group_id: string;
      name: string;
      service_name_snapshot: string;
      period: string;
      expected_cents: string;
      collected_cents: string;
      in_review_cents: string;
      pending_cents: string;
    }>(
      `SELECT gc.group_id, g.name, g.service_name_snapshot, gc.period, gc.expected_cents,
              gc.collected_cents, gc.in_review_cents, gc.pending_cents
         FROM v_group_collection gc
         JOIN groups g ON g.id = gc.group_id
        WHERE g.owner_id = $1 AND gc.period = $2 AND ($3::uuid IS NULL OR gc.group_id = $3)
        ORDER BY g.service_name_snapshot, g.name, gc.group_id`,
      [ownerId, period, groupId],
    );
    return result.rows.map((r) => ({
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      period: r.period,
      expectedCents: num(r.expected_cents),
      collectedCents: num(r.collected_cents),
      inReviewCents: num(r.in_review_cents),
      pendingCents: num(r.pending_cents),
    }));
  }

  /** Miembros con cobro `atrasado` en el período de los grupos dados. */
  async lateMembers(
    q: Queryable,
    groupIds: readonly string[],
    period: string,
  ): Promise<LateMemberRow[]> {
    if (groupIds.length === 0) return [];
    const result = await q.query<{
      group_id: string;
      user_id: string;
      full_name: string;
      id: string;
      amount_cents: string;
      due_at: Date;
    }>(
      `SELECT c.group_id, c.user_id, u.full_name, c.id, c.amount_cents, c.due_at
         FROM charges c
         JOIN users u ON u.id = c.user_id
        WHERE c.group_id = ANY($1::uuid[]) AND c.period = $2 AND c.status = 'atrasado'
        ORDER BY c.due_at, c.id`,
      [[...groupIds], period],
    );
    return result.rows.map((r) => ({
      groupId: r.group_id,
      userId: r.user_id,
      fullName: r.full_name,
      chargeId: r.id,
      amountCents: num(r.amount_cents),
      dueAt: r.due_at,
    }));
  }

  /** Gasto y pagado por mes en `[fromPeriod, toPeriod]` (RF-006-07). */
  async monthlySpend(
    q: Queryable,
    userId: string,
    fromPeriod: string,
    toPeriod: string,
    groupId: string | null,
  ): Promise<MonthlyRow[]> {
    const result = await q.query<{ period: string; total: string; paid: string }>(
      `SELECT period, sum(cost_cents)::bigint AS total,
              COALESCE(sum(paid_cents), 0)::bigint AS paid
         FROM v_user_cost_lines
        WHERE user_id = $1 AND period BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR group_id = $4)
        GROUP BY period ORDER BY period`,
      [userId, fromPeriod, toPeriod, groupId],
    );
    return result.rows.map((r) => ({
      period: r.period,
      totalCents: num(r.total),
      paidCents: num(r.paid),
    }));
  }

  /** Cuota y precio individual por grupo y mes, para el ahorro acumulado (RF-006-09). */
  async savingsInputs(
    q: Queryable,
    userId: string,
    fromPeriod: string,
    toPeriod: string,
    groupId: string | null,
  ): Promise<SavingsMonthRow[]> {
    const result = await q.query<{ period: string; individual: string | null; share: string }>(
      `SELECT period, max(individual_price_bs_cents)::bigint AS individual,
              sum(cost_cents)::bigint AS share
         FROM v_user_cost_lines
        WHERE user_id = $1 AND period BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR group_id = $4)
        GROUP BY period, group_id ORDER BY period, group_id`,
      [userId, fromPeriod, toPeriod, groupId],
    );
    return result.rows.map((r) => ({
      period: r.period,
      individualPriceBsCents: numOrNull(r.individual),
      shareCents: num(r.share),
    }));
  }

  /** Primer período con datos de la persona (para acotar la serie de 12 meses). */
  async firstPeriod(q: Queryable, userId: string, groupId: string | null): Promise<string | null> {
    const result = await q.query<{ first: string | null }>(
      `SELECT min(period) AS first FROM v_user_cost_lines
        WHERE user_id = $1 AND ($2::uuid IS NULL OR group_id = $2)`,
      [userId, groupId],
    );
    return result.rows[0]?.first ?? null;
  }

  /** Páginas de cobros del panel (`debts`, `in_review`, `owed`), del más vencido al más reciente. */
  async listCharges(q: Queryable, query: ListChargesQuery): Promise<ChargeLineRow[]> {
    const ownerScope = query.kind === 'owed';
    const statuses =
      query.kind === 'debts'
        ? ['pendiente', 'atrasado']
        : query.kind === 'in_review'
          ? ['en_revision']
          : ['pendiente', 'atrasado', 'en_revision'];
    const result = await q.query<{
      id: string;
      group_id: string;
      name: string;
      service_name_snapshot: string;
      period: string;
      full_name: string;
      amount_cents: string;
      status: ChargeLineRow['status'];
      due_at: Date;
    }>(
      `SELECT c.id, c.group_id, g.name, g.service_name_snapshot, c.period, u.full_name,
              c.amount_cents, c.status, c.due_at
         FROM charges c
         JOIN groups g ON g.id = c.group_id
         JOIN users u ON u.id = c.user_id
        WHERE ${ownerScope ? 'g.owner_id' : 'c.user_id'} = $1
          AND c.status = ANY($2::text[])
          AND ($3::uuid IS NULL OR c.group_id = $3)
          AND ($4::timestamptz IS NULL OR (c.due_at, c.id) > ($4::timestamptz, $5::uuid))
        ORDER BY c.due_at, c.id
        LIMIT $6`,
      [
        query.userId,
        statuses,
        query.groupId,
        query.after?.dueAt ?? null,
        query.after?.id ?? null,
        query.limit,
      ],
    );
    return result.rows.map((r) => ({
      chargeId: r.id,
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      period: r.period,
      memberName: ownerScope ? r.full_name : null,
      amountCents: num(r.amount_cents),
      status: r.status,
      dueAt: r.due_at,
    }));
  }
}
