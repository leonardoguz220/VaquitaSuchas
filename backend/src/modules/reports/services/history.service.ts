import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { lastPayDay } from '../domain/calendar-events.js';
import { decodeHistoryCursor, encodeHistoryCursor } from '../domain/history-cursor.js';
import { ReportsRepository } from '../repositories/reports.repository.js';

export const DEFAULT_HISTORY_PAGE = 20;
export const MAX_HISTORY_PAGE = 50;

export interface HistoryItem {
  chargeId: string;
  period: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  amountCents: number;
  status: string;
  origin: 'ciclo' | 'ingreso';
  dueDate: string;
  paidAt: string | null;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

/** Historial propio paginado (spec 006, US5): todos los cobros de la persona, también cancelados. */
@Injectable()
export class HistoryService {
  constructor(
    private readonly db: DbService,
    private readonly reports: ReportsRepository,
  ) {}

  async list(
    userId: string,
    options: {
      period?: string | null;
      groupId?: string | null;
      statuses?: readonly string[];
      limit?: number | null;
      cursor?: string | null;
    },
  ): Promise<HistoryPage> {
    const after = options.cursor ? decodeHistoryCursor(options.cursor) : null;
    if (options.cursor && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_HISTORY_PAGE, 1), MAX_HISTORY_PAGE);
    const rows = await this.reports.historyPage(
      this.db,
      {
        userId,
        groupId: null,
        groupFilter: options.groupId ?? null,
        period: options.period ?? null,
        statuses: options.statuses ?? [],
      },
      after,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        chargeId: r.chargeId,
        period: r.period,
        groupId: r.groupId,
        groupName: r.groupName,
        serviceName: r.serviceName,
        amountCents: r.amountCents,
        status: r.status,
        origin: r.origin,
        dueDate: lastPayDay(r.dueAt),
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeHistoryCursor({ period: last.period, id: last.chargeId })
          : null,
    };
  }
}
