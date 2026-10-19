import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import type { LaPazDate } from '../../subscriptions/domain/billing-calendar.js';
import type { ChargeStatus } from '../domain/charge-state.js';
import { dueAtFor } from '../domain/due-date.js';
import { decodeHistoryCursor, encodeHistoryCursor } from '../domain/history-cursor.js';
import { oneChargePerMember, ownerTotals } from '../domain/period-totals.js';
import { ChargeReadRepository } from '../repositories/charge-read.repository.js';
import { ChargesRepository, type ChargeRecord } from '../repositories/charges.repository.js';
import { CyclesRepository } from '../repositories/cycles.repository.js';
import { ChargeEventsRepository } from '../repositories/events.repository.js';
import { BillingReadService, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './billing-read.service.js';
import { notFound } from './charge-access.service.js';
import { OverdueService } from './overdue.service.js';
import { presentPublicCharge } from './charge-presenter.js';
import type { ChargePublicView, GroupChargesPage, PeriodSummaryView } from './charge-views.js';

export interface GroupChargesQuery {
  period: string | null;
  statuses: readonly ChargeStatus[];
  userId: string | null;
  limit: number | null;
  cursor: string | null;
}

const formatDate = (d: LaPazDate): string =>
  `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/**
 * Resumen del mes e historial del grupo (spec 002, US5, RF-002-16 a RF-002-18). Solo los miembros
 * activos consultan (cualquier otra persona recibe 404, sin revelar el grupo). Lo que ve un miembro
 * es siempre `ChargePublic`: sin comprobantes, referencias ni motivos (RNF-002-07). El titular
 * recibe además los totales del período y el `Charge` completo en el historial.
 */
@Injectable()
export class GroupBillingService {
  constructor(
    private readonly db: DbService,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly cycles: CyclesRepository,
    private readonly charges: ChargesRepository,
    private readonly events: ChargeEventsRepository,
    private readonly reads: ChargeReadRepository,
    private readonly billingReads: BillingReadService,
    private readonly clock: Clock,
    private readonly overdue: OverdueService,
  ) {}

  /** `GET /groups/:groupId/billing/summary` (CA-002-17, CA-002-20). */
  async summary(
    userId: string,
    groupId: string,
    period: string | null,
  ): Promise<PeriodSummaryView> {
    await this.overdue.sweepGroup(groupId, this.clock.now());
    const group = await this.requireMember(userId, groupId);
    const availablePeriods = await this.cycles.listPeriods(this.db, groupId);
    // Por omisión, el período del último ciclo; sin ciclo para el período pedido, 404.
    const target = period ?? availablePeriods[0] ?? null;
    const cycle = target ? await this.cycles.findByGroupAndPeriod(this.db, groupId, target) : null;
    if (!cycle) throw notFound();

    const all = await this.charges.listByGroupPeriod(this.db, groupId, cycle.period);
    const rows = oneChargePerMember(all);
    const publics = await this.present(groupId, rows);
    const view: PeriodSummaryView = {
      period: cycle.period,
      cycleType: cycle.cycleType,
      cutDate: formatDate(cycle.cutDate),
      dueAt: dueAtFor(cycle.cutDate, cycle.issuedAt).toISOString(),
      totalBsCents: cycle.totalBsCents,
      memberCount: cycle.memberCount,
      baseShareCents: cycle.baseShareCents,
      ownerShareCents: cycle.ownerShareCents,
      rows: publics.map((charge) => ({ charge, isFormerMember: charge.member.isFormerMember })),
      availablePeriods,
    };
    // Los totales cuentan todos los cobros del período, no solo uno por miembro.
    if (group.owner_id === userId) view.ownerTotals = ownerTotals(all);
    return view;
  }

  /** `GET /groups/:groupId/charges` (CA-002-18). */
  async history(
    userId: string,
    groupId: string,
    query: GroupChargesQuery,
  ): Promise<GroupChargesPage> {
    await this.overdue.sweepGroup(groupId, this.clock.now());
    const group = await this.requireMember(userId, groupId);
    const after = query.cursor === null ? null : decodeHistoryCursor(query.cursor);
    if (query.cursor !== null && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const found = await this.charges.listGroupHistory(this.db, {
      groupId,
      period: query.period,
      statuses: query.statuses,
      userId: query.userId,
      limit: limit + 1,
      after,
    });
    const page = found.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      found.length > limit && last
        ? encodeHistoryCursor({ period: last.period, issuedAt: last.issuedAt, id: last.id })
        : null;

    const items =
      group.owner_id === userId
        ? await this.billingReads.ownerViews(page)
        : await this.present(groupId, page);
    return { items, nextCursor };
  }

  /** Miembro activo del grupo (el titular también lo es); si no, 404. */
  private async requireMember(userId: string, groupId: string): Promise<GroupRow> {
    const group = await this.groups.findById(this.db, groupId);
    if (!group) throw notFound();
    const membership = await this.members.findActive(this.db, groupId, userId);
    if (!membership && group.owner_id !== userId) throw notFound();
    return group;
  }

  /** Vistas públicas con una consulta por tipo de dato (sin N+1). */
  private async present(
    groupId: string,
    charges: readonly ChargeRecord[],
  ): Promise<ChargePublicView[]> {
    if (charges.length === 0) return [];
    const [events, active] = await Promise.all([
      this.events.listByCharges(
        this.db,
        charges.map((charge) => charge.id),
      ),
      this.members.listActive(this.db, groupId),
    ]);
    const activeIds = new Set(active.map((member) => member.user_id));
    const personIds = new Set<string>(charges.map((charge) => charge.userId));
    for (const event of events) if (event.actorId) personIds.add(event.actorId);
    const names = await this.reads.findUserNames(this.db, [...personIds]);
    return charges.map((charge) =>
      presentPublicCharge({
        charge,
        memberActive: activeIds.has(charge.userId),
        events: events.filter((event) => event.chargeId === charge.id),
        names,
      }),
    );
  }
}
