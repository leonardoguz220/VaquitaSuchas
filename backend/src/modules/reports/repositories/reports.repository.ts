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

export interface GroupBrief {
  groupId: string;
  groupName: string;
  serviceName: string;
}

export interface GroupMemberChargeRow {
  userId: string;
  fullName: string;
  chargeId: string;
  amountCents: number;
  status: string;
}

export interface CalendarGroupRow {
  groupId: string;
  groupName: string;
  serviceName: string;
  role: 'miembro' | 'titular';
  billingDay: number;
  closed: boolean;
  memberCount: number;
  totalBsCents: number;
}

export interface CalendarChargeRow {
  chargeId: string | null;
  groupId: string;
  period: string;
  amountCents: number;
  status: string | null;
  dueAt: Date;
}

export interface HistoryRow {
  chargeId: string;
  period: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  memberName: string;
  amountCents: number;
  status: string;
  origin: 'ciclo' | 'ingreso';
  dueAt: Date;
  paidAt: Date | null;
}

export interface HistoryFilter {
  /** Historial propio: `userId` es la persona; del grupo: filtro opcional por miembro. */
  userId: string | null;
  /** Historial del grupo (titular); `null` en el historial propio. */
  groupId: string | null;
  /** Filtro opcional por suscripción en el historial propio. */
  groupFilter: string | null;
  period: string | null;
  statuses: readonly string[];
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

  async groupBrief(q: Queryable, groupId: string): Promise<GroupBrief | null> {
    const result = await q.query<{ id: string; name: string; service_name_snapshot: string }>(
      `SELECT id, name, service_name_snapshot FROM groups WHERE id = $1`,
      [groupId],
    );
    const row = result.rows[0];
    return row
      ? { groupId: row.id, groupName: row.name, serviceName: row.service_name_snapshot }
      : null;
  }

  /** Períodos con ciclo del grupo, del más reciente al más antiguo. */
  async availablePeriodsOfGroup(q: Queryable, groupId: string): Promise<string[]> {
    const result = await q.query<{ period: string }>(
      `SELECT period FROM billing_cycles WHERE group_id = $1 ORDER BY period DESC`,
      [groupId],
    );
    return result.rows.map((r) => r.period);
  }

  /** Cobros no cancelados del grupo en el período; sin comprobantes ni referencias (RNF-006-03). */
  async memberCharges(
    q: Queryable,
    groupId: string,
    period: string,
  ): Promise<GroupMemberChargeRow[]> {
    const result = await q.query<{
      user_id: string;
      full_name: string;
      id: string;
      amount_cents: string;
      status: string;
    }>(
      `SELECT c.user_id, u.full_name, c.id, c.amount_cents, c.status
         FROM charges c JOIN users u ON u.id = c.user_id
        WHERE c.group_id = $1 AND c.period = $2 AND c.status <> 'cancelado'
        ORDER BY u.full_name, c.id`,
      [groupId, period],
    );
    return result.rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      chargeId: r.id,
      amountCents: num(r.amount_cents),
      status: r.status,
    }));
  }

  /** Grupos del calendario: donde es miembro activo o donde tiene ciclos o cobros (cerrados incluidos). */
  async calendarGroups(q: Queryable, userId: string): Promise<CalendarGroupRow[]> {
    const result = await q.query<{
      id: string;
      name: string;
      service_name_snapshot: string;
      owner_id: string;
      billing_day: number;
      status: string;
      members: string;
      total_bs_cents: string;
    }>(
      `SELECT g.id, g.name, g.service_name_snapshot, g.owner_id, g.billing_day, g.status,
              g.total_bs_cents,
              (SELECT count(*) FROM group_members m
                WHERE m.group_id = g.id AND m.left_at IS NULL) AS members
         FROM groups g
        WHERE EXISTS (SELECT 1 FROM group_members m
                       WHERE m.group_id = g.id AND m.user_id = $1 AND m.left_at IS NULL)
           OR EXISTS (SELECT 1 FROM charges c WHERE c.group_id = g.id AND c.user_id = $1)
           OR EXISTS (SELECT 1 FROM billing_cycles bc WHERE bc.group_id = g.id AND bc.owner_id = $1)
        ORDER BY g.service_name_snapshot, g.name, g.id`,
      [userId],
    );
    return result.rows.map((r) => ({
      groupId: r.id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      role: r.owner_id === userId ? 'titular' : 'miembro',
      billingDay: r.billing_day,
      closed: r.status === 'cerrado',
      memberCount: num(r.members),
      totalBsCents: num(r.total_bs_cents),
    }));
  }

  /** Cobros propios de los períodos dados y todos los abiertos (para los vencimientos). */
  async calendarCharges(
    q: Queryable,
    userId: string,
    periods: readonly string[],
  ): Promise<CalendarChargeRow[]> {
    const result = await q.query<{
      id: string;
      group_id: string;
      period: string;
      amount_cents: string;
      status: string;
      due_at: Date;
    }>(
      `SELECT id, group_id, period, amount_cents, status, due_at
         FROM charges
        WHERE user_id = $1 AND status <> 'cancelado'
          AND (period = ANY($2::text[]) OR status IN ('pendiente', 'atrasado'))
        ORDER BY due_at, id`,
      [userId, [...periods]],
    );
    return result.rows.map((r) => ({
      chargeId: r.id,
      groupId: r.group_id,
      period: r.period,
      amountCents: num(r.amount_cents),
      status: r.status,
      dueAt: r.due_at,
    }));
  }

  /** Ciclos de los períodos dados donde la persona era titular: su cuota de referencia no es un cobro. */
  async ownerCycles(
    q: Queryable,
    userId: string,
    periods: readonly string[],
  ): Promise<CalendarChargeRow[]> {
    const result = await q.query<{
      group_id: string;
      period: string;
      owner_share_cents: string;
      due_date: string;
    }>(
      `SELECT group_id, period, owner_share_cents, due_date::text AS due_date
         FROM billing_cycles
        WHERE owner_id = $1 AND period = ANY($2::text[])`,
      [userId, [...periods]],
    );
    return result.rows.map((r) => ({
      chargeId: null,
      groupId: r.group_id,
      period: r.period,
      amountCents: num(r.owner_share_cents),
      status: null,
      dueAt: new Date(`${r.due_date}T00:00:00Z`),
    }));
  }

  private historyWhere(filter: HistoryFilter): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const add = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const conditions: string[] = [];
    if (filter.userId !== null) conditions.push(`c.user_id = ${add(filter.userId)}`);
    if (filter.groupId !== null) conditions.push(`c.group_id = ${add(filter.groupId)}`);
    if (filter.groupFilter !== null) conditions.push(`c.group_id = ${add(filter.groupFilter)}`);
    if (filter.period !== null) conditions.push(`c.period = ${add(filter.period)}`);
    if (filter.statuses.length > 0) {
      conditions.push(`c.status = ANY(${add([...filter.statuses])}::text[])`);
    }
    return { sql: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE', params };
  }

  /** Cantidad de filas del historial (para el límite de exportación). */
  async countHistory(q: Queryable, filter: HistoryFilter): Promise<number> {
    const where = this.historyWhere(filter);
    const result = await q.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM charges c WHERE ${where.sql}`,
      where.params,
    );
    return num(result.rows[0]?.total ?? 0);
  }

  /** Página del historial por período descendente (también `cancelado`, RN-006-07). */
  async historyPage(
    q: Queryable,
    filter: HistoryFilter,
    after: { period: string; id: string } | null,
    limit: number,
  ): Promise<HistoryRow[]> {
    const where = this.historyWhere(filter);
    const params = [...where.params];
    let cursorSql = '';
    if (after) {
      params.push(after.period, after.id);
      cursorSql = ` AND (c.period, c.id) < ($${params.length - 1}::text, $${params.length}::uuid)`;
    }
    params.push(limit);
    const result = await q.query<{
      id: string;
      period: string;
      group_id: string;
      name: string;
      service_name_snapshot: string;
      full_name: string;
      amount_cents: string;
      status: string;
      origin: 'ciclo' | 'ingreso';
      due_at: Date;
      paid_at: Date | null;
    }>(
      `SELECT c.id, c.period, c.group_id, g.name, g.service_name_snapshot, u.full_name,
              c.amount_cents, c.status, c.origin, c.due_at, c.paid_at
         FROM charges c
         JOIN groups g ON g.id = c.group_id
         JOIN users u ON u.id = c.user_id
        WHERE ${where.sql}${cursorSql}
        ORDER BY c.period DESC, c.id DESC
        LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((r) => ({
      chargeId: r.id,
      period: r.period,
      groupId: r.group_id,
      groupName: r.name,
      serviceName: r.service_name_snapshot,
      memberName: r.full_name,
      amountCents: num(r.amount_cents),
      status: r.status,
      origin: r.origin,
      dueAt: r.due_at,
      paidAt: r.paid_at,
    }));
  }
}
