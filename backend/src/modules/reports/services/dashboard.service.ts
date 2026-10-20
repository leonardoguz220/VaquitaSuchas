import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import { daysLate, lastPayDay } from '../domain/calendar-events.js';
import { percentCollected } from '../domain/collection.js';
import { decodeListCursor, encodeListCursor } from '../domain/list-cursor.js';
import { savingsForLine, summarizeSavings } from '../domain/savings.js';
import {
  SUBSCRIPTION_MEMBERSHIP_QUERY,
  type SubscriptionMembershipQuery,
} from '../ports/subscription-membership-query.port.js';
import {
  ReportsRepository,
  type ChargeLineRow,
  type ChargeListKind,
  type CollectionRow,
  type LateMemberRow,
} from '../repositories/reports.repository.js';

export const DEFAULT_LIST_SIZE = 20;
export const MAX_LIST_SIZE = 50;

export interface SpendLine {
  groupId: string;
  groupName: string;
  serviceName: string;
  logoUrl: string | null;
  role: 'miembro' | 'titular';
  costCents: number;
  paidCents: number | null;
}

export interface SavingsLine {
  groupId: string;
  serviceName: string;
  role: 'miembro' | 'titular';
  individualPriceBsCents: number;
  shareCents: number;
  savingsCents: number;
}

export interface CollectionSummary extends CollectionRow {
  percentCollected: number | null;
  lateMembers: {
    userId: string;
    fullName: string;
    chargeId: string;
    amountCents: number;
    dueDate: string;
    daysLate: number;
  }[];
}

export interface DashboardSummary {
  month: string;
  groupId: string | null;
  availableMonths: string[];
  isEmpty: boolean;
  hasGroups: boolean;
  spend: { totalCents: number; paidCents: number; lines: SpendLine[] };
  savings: {
    totalCents: number | null;
    estimated: true;
    lines: SavingsLine[];
    withoutData: { groupId: string; serviceName: string }[];
    negativeNote: string | null;
  };
  debts: { totalCents: number; count: number; inReviewCents: number; inReviewCount: number };
  owed: null | {
    totalCents: number;
    count: number;
    groups: {
      groupId: string;
      groupName: string;
      serviceName: string;
      totalCents: number;
      count: number;
    }[];
  };
  collection: CollectionSummary[];
}

export interface ChargeLine {
  chargeId: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  period: string;
  memberName: string | null;
  amountCents: number;
  status: ChargeLineRow['status'];
  dueDate: string;
  link: string;
}

export interface ChargeLinesPage {
  items: ChargeLine[];
  nextCursor: string | null;
}

export interface GroupCollection extends CollectionSummary {
  availablePeriods: string[];
  members: {
    userId: string;
    fullName: string;
    chargeId: string;
    amountCents: number;
    status: string;
  }[];
}

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/** Panel del usuario (spec 006, partes A): solo lee; el `userId` siempre sale del token (RNF-006-03). */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly reports: ReportsRepository,
    @Inject(SUBSCRIPTION_MEMBERSHIP_QUERY) private readonly membership: SubscriptionMembershipQuery,
  ) {}

  /** Mes actual de La Paz como `AAAA-MM`. */
  currentMonth(): string {
    const p = toLaPazParts(this.clock.now());
    return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}`;
  }

  /** `404` si el grupo no es de la persona (CA-006-18). */
  async assertGroupVisible(userId: string, groupId: string | null): Promise<void> {
    if (groupId === null) return;
    const groupIds = await this.membership.groupIdsOf(this.db, userId);
    if (!groupIds.includes(groupId)) throw notFound();
  }

  /** `GET /me/dashboard` (RF-006-01 a 06). */
  async summary(
    userId: string,
    options: { month?: string | null; groupId?: string | null },
  ): Promise<DashboardSummary> {
    const month = options.month ?? this.currentMonth();
    const groupId = options.groupId ?? null;
    await this.assertGroupVisible(userId, groupId);

    const [groupIds, spendRows, availableMonths, debtTotals, isOwner] = await Promise.all([
      this.membership.groupIdsOf(this.db, userId),
      this.reports.spendLines(this.db, userId, month, groupId),
      this.reports.availableMonths(this.db, userId),
      this.reports.debtTotals(this.db, userId),
      this.reports.isOwnerOfAnyGroup(this.db, userId),
    ]);
    const [owedGroups, collectionRows] = isOwner
      ? await Promise.all([
          this.reports.owedByGroup(this.db, userId),
          this.reports.collectionForOwner(this.db, userId, month, groupId),
        ])
      : [[], []];
    const late = await this.reports.lateMembers(
      this.db,
      collectionRows.map((r) => r.groupId),
      month,
    );

    const lines: SpendLine[] = spendRows.map((r) => ({
      groupId: r.groupId,
      groupName: r.groupName,
      serviceName: r.serviceName,
      logoUrl: r.logoUrl,
      role: r.role,
      costCents: r.costCents,
      paidCents: r.role === 'titular' ? null : r.paidCents,
    }));
    const summarized = summarizeSavings(
      spendRows.map((r) => ({
        individualPriceBsCents: r.individualPriceBsCents,
        shareCents: r.costCents,
      })),
    );
    const savingsLines: SavingsLine[] = [];
    const withoutData: { groupId: string; serviceName: string }[] = [];
    for (const r of spendRows) {
      const savingsCents = savingsForLine(r.individualPriceBsCents, r.costCents);
      if (savingsCents === null || r.individualPriceBsCents === null) {
        withoutData.push({ groupId: r.groupId, serviceName: r.serviceName });
      } else {
        savingsLines.push({
          groupId: r.groupId,
          serviceName: r.serviceName,
          role: r.role,
          individualPriceBsCents: r.individualPriceBsCents,
          shareCents: r.costCents,
          savingsCents,
        });
      }
    }

    return {
      month,
      groupId,
      availableMonths,
      isEmpty: lines.length === 0 && debtTotals.debtCount === 0 && debtTotals.inReviewCount === 0,
      hasGroups: groupIds.length > 0,
      spend: {
        totalCents: lines.reduce((sum, l) => sum + l.costCents, 0),
        // El titular no tiene «pagado»: solo cuentan los cobros de miembro `pagado`.
        paidCents: lines.reduce((sum, l) => sum + (l.paidCents ?? 0), 0),
        lines,
      },
      savings: {
        totalCents: summarized.totalCents,
        estimated: true,
        lines: savingsLines,
        withoutData,
        negativeNote: summarized.negativeNote,
      },
      debts: {
        totalCents: debtTotals.debtCents,
        count: debtTotals.debtCount,
        inReviewCents: debtTotals.inReviewCents,
        inReviewCount: debtTotals.inReviewCount,
      },
      owed: isOwner
        ? {
            totalCents: owedGroups.reduce((sum, g) => sum + g.totalCents, 0),
            count: owedGroups.reduce((sum, g) => sum + g.count, 0),
            groups: owedGroups,
          }
        : null,
      collection: collectionRows.map((row) => this.toCollectionSummary(row, late)),
    };
  }

  private toCollectionSummary(
    row: CollectionRow,
    late: readonly LateMemberRow[],
  ): CollectionSummary {
    const now = this.clock.now();
    return {
      ...row,
      percentCollected: percentCollected(row.collectedCents, row.expectedCents),
      lateMembers: late
        .filter((m) => m.groupId === row.groupId)
        .map((m) => ({
          userId: m.userId,
          fullName: m.fullName,
          chargeId: m.chargeId,
          amountCents: m.amountCents,
          dueDate: lastPayDay(m.dueAt),
          daysLate: daysLate(m.dueAt, now),
        })),
    };
  }

  /** `GET /groups/:groupId/collection` (RF-006-06): solo el titular; `403` miembro, `404` ajeno. */
  async groupCollection(
    userId: string,
    groupId: string,
    period: string | null,
  ): Promise<GroupCollection> {
    const groupIds = await this.membership.groupIdsOf(this.db, userId);
    if (!groupIds.includes(groupId)) throw notFound();
    if (!(await this.membership.isOwner(this.db, userId, groupId))) {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    const month = period ?? this.currentMonth();
    const [rows, late, availablePeriods, members, brief] = await Promise.all([
      this.reports.collectionForOwner(this.db, userId, month, groupId),
      this.reports.lateMembers(this.db, [groupId], month),
      this.reports.availablePeriodsOfGroup(this.db, groupId),
      this.reports.memberCharges(this.db, groupId, month),
      this.reports.groupBrief(this.db, groupId),
    ]);
    if (!brief) throw notFound();
    // Sin ciclo en el período todo es cero (no un error).
    const row: CollectionRow = rows[0] ?? {
      ...brief,
      period: month,
      expectedCents: 0,
      collectedCents: 0,
      inReviewCents: 0,
      pendingCents: 0,
    };
    return { ...this.toCollectionSummary(row, late), availablePeriods, members };
  }

  /** `GET /me/dashboard/lists` (RF-006-04, 05): páginas por cursor de `debts`, `in_review` y `owed`. */
  async list(
    userId: string,
    options: {
      list: ChargeListKind;
      groupId?: string | null;
      limit?: number | null;
      cursor?: string | null;
    },
  ): Promise<ChargeLinesPage> {
    const groupId = options.groupId ?? null;
    await this.assertGroupVisible(userId, groupId);
    if (options.list === 'owed' && !(await this.reports.isOwnerOfAnyGroup(this.db, userId))) {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    const after = options.cursor ? decodeListCursor(options.cursor) : null;
    if (options.cursor && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIST_SIZE, 1), MAX_LIST_SIZE);
    const rows = await this.reports.listCharges(this.db, {
      kind: options.list,
      userId,
      groupId,
      limit: limit + 1,
      after,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        chargeId: r.chargeId,
        groupId: r.groupId,
        groupName: r.groupName,
        serviceName: r.serviceName,
        period: r.period,
        memberName: r.memberName,
        amountCents: r.amountCents,
        status: r.status,
        dueDate: lastPayDay(r.dueAt),
        link: `/cobros/${r.chargeId}`,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeListCursor({ dueAt: last.dueAt, id: last.chargeId })
          : null,
    };
  }
}
