import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { csvHeader, csvRow, formatCsvDate, type CsvColumn } from '../domain/csv.js';
import {
  SUBSCRIPTION_MEMBERSHIP_QUERY,
  type SubscriptionMembershipQuery,
} from '../ports/subscription-membership-query.port.js';
import { ExportLimitRepository } from '../repositories/export-limit.repository.js';
import {
  ReportsRepository,
  type HistoryFilter,
  type HistoryRow,
} from '../repositories/reports.repository.js';

export const EXPORT_BUCKET = 'export:user';
export const EXPORTS_PER_HOUR = 10;
export const EXPORT_MAX_ROWS = 20_000;
const HOUR_MS = 60 * 60 * 1000;
const PAGE = 500;

const base: CsvColumn<HistoryRow>[] = [
  { header: 'periodo', kind: 'text', value: (r) => r.period },
  { header: 'servicio', kind: 'text', value: (r) => r.serviceName },
  { header: 'grupo', kind: 'text', value: (r) => r.groupName },
];
const rest: CsvColumn<HistoryRow>[] = [
  { header: 'monto_bs', kind: 'amount', value: (r) => r.amountCents },
  { header: 'estado', kind: 'text', value: (r) => r.status },
  // `due_at` es exclusivo: el último día de pago es el día anterior.
  { header: 'vencimiento', kind: 'date', value: (r) => new Date(r.dueAt.getTime() - 1) },
  { header: 'fecha_pago', kind: 'date', value: (r) => r.paidAt },
  { header: 'origen', kind: 'text', value: (r) => r.origin },
];
const OWN_COLUMNS = [...base, ...rest];
const GROUP_COLUMNS = [
  ...base,
  {
    header: 'miembro',
    kind: 'text',
    value: (r: HistoryRow) => r.memberName,
  } as CsvColumn<HistoryRow>,
  ...rest,
];

export interface CsvExport {
  filename: string;
  chunks: AsyncIterable<string>;
}

/** Exportación del historial a CSV en flujo (spec 006, US5; RNF-006-04). Nunca incluye comprobantes. */
@Injectable()
export class ExportService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly reports: ReportsRepository,
    private readonly limits: ExportLimitRepository,
    @Inject(SUBSCRIPTION_MEMBERSHIP_QUERY) private readonly membership: SubscriptionMembershipQuery,
  ) {}

  private maxRows(): number {
    return Number(this.config.get('EXPORT_MAX_ROWS') ?? EXPORT_MAX_ROWS);
  }

  /** Historial propio; un `groupId` ajeno responde `404` (CA-006-18). */
  async exportOwn(
    userId: string,
    options: { period?: string | null; groupId?: string | null; statuses?: readonly string[] },
  ): Promise<CsvExport> {
    if (options.groupId) {
      const groupIds = await this.membership.groupIdsOf(this.db, userId);
      if (!groupIds.includes(options.groupId)) {
        throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
      }
    }
    return this.prepare(userId, 'vaquita-historial', OWN_COLUMNS, {
      userId,
      groupId: null,
      groupFilter: options.groupId ?? null,
      period: options.period ?? null,
      statuses: options.statuses ?? [],
    });
  }

  /** Historial del grupo, solo para el titular (`403` miembro, `404` ajeno). */
  async exportGroup(
    userId: string,
    groupId: string,
    options: { period?: string | null; userId?: string | null; statuses?: readonly string[] },
  ): Promise<CsvExport> {
    const groupIds = await this.membership.groupIdsOf(this.db, userId);
    if (!groupIds.includes(groupId)) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
    }
    if (!(await this.membership.isOwner(this.db, userId, groupId))) {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    return this.prepare(userId, 'vaquita-historial-grupo', GROUP_COLUMNS, {
      userId: options.userId ?? null,
      groupId,
      groupFilter: null,
      period: options.period ?? null,
      statuses: options.statuses ?? [],
    });
  }

  private async prepare(
    userId: string,
    filePrefix: string,
    columns: readonly CsvColumn<HistoryRow>[],
    filter: HistoryFilter,
  ): Promise<CsvExport> {
    const now = this.clock.now();
    const keyHash = createHmac('sha256', this.config.getOrThrow<string>('FINGERPRINT_KEY'))
      .update(`export:${userId}`)
      .digest('hex');
    const used = await this.limits.countSince(
      this.db,
      EXPORT_BUCKET,
      keyHash,
      new Date(now.getTime() - HOUR_MS),
    );
    if (used.count >= EXPORTS_PER_HOUR) {
      const unlockAt = (used.oldest ?? now).getTime() + HOUR_MS;
      throw new DomainError(ErrorCode.RATE_LIMITED, 429, DEFAULT_MESSAGES.RATE_LIMITED, {
        retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - now.getTime()) / 1000)),
      });
    }
    const max = this.maxRows();
    if ((await this.reports.countHistory(this.db, filter)) > max) {
      throw new DomainError(
        'EXPORT_TOO_LARGE',
        422,
        'La exportación es demasiado grande. Filtra por período.',
        { maxRows: max },
      );
    }
    await this.limits.record(this.db, EXPORT_BUCKET, keyHash, now);
    return {
      filename: `${filePrefix}-${formatCsvDate(now)}.csv`,
      chunks: this.stream(columns, filter, max),
    };
  }

  private async *stream(
    columns: readonly CsvColumn<HistoryRow>[],
    filter: HistoryFilter,
    max: number,
  ): AsyncGenerator<string> {
    yield csvHeader(columns);
    let after: { period: string; id: string } | null = null;
    let written = 0;
    while (written < max) {
      const size = Math.min(PAGE, max - written);
      const rows = await this.reports.historyPage(this.db, filter, after, size);
      if (rows.length === 0) return;
      yield rows.map((row) => csvRow(row, columns)).join('');
      written += rows.length;
      const last = rows[rows.length - 1] as HistoryRow;
      after = { period: last.period, id: last.chargeId };
      if (rows.length < size) return;
    }
  }
}
