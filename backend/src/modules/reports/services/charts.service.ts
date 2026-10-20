import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { cumulative, lastMonths } from '../domain/months.js';
import { summarizeSavings } from '../domain/savings.js';
import { ReportsRepository } from '../repositories/reports.repository.js';
import { DashboardService } from './dashboard.service.js';

export interface ChartsResponse {
  monthly: { period: string; totalCents: number; paidCents: number }[];
  byService: { groupId: string; serviceName: string; costCents: number }[];
  savings: { period: string; savingsCents: number | null; cumulativeCents: number }[];
}

/** Series de los gráficos (spec 006, US3): 12 meses sin huecos, gasto por servicio y ahorro acumulado. */
@Injectable()
export class ChartsService {
  constructor(
    private readonly db: DbService,
    private readonly reports: ReportsRepository,
    private readonly dashboard: DashboardService,
  ) {}

  async charts(
    userId: string,
    options: { month?: string | null; groupId?: string | null },
  ): Promise<ChartsResponse> {
    const month = options.month ?? this.dashboard.currentMonth();
    const groupId = options.groupId ?? null;
    await this.dashboard.assertGroupVisible(userId, groupId);

    const firstPeriod = await this.reports.firstPeriod(this.db, userId, groupId);
    const periods = lastMonths(month, firstPeriod);
    const from = periods[0] as string;
    const [monthlyRows, savingsRows, spendRows] = await Promise.all([
      this.reports.monthlySpend(this.db, userId, from, month, groupId),
      this.reports.savingsInputs(this.db, userId, from, month, groupId),
      this.reports.spendLines(this.db, userId, month, groupId),
    ]);

    const monthly = periods.map((period) => {
      const row = monthlyRows.find((r) => r.period === period);
      return { period, totalCents: row?.totalCents ?? 0, paidCents: row?.paidCents ?? 0 };
    });
    const perMonth = periods.map((period) => ({
      period,
      value: summarizeSavings(savingsRows.filter((r) => r.period === period)).totalCents,
    }));
    const accumulated = cumulative(perMonth);
    return {
      monthly,
      byService: spendRows.map((r) => ({
        groupId: r.groupId,
        serviceName: r.serviceName,
        costCents: r.costCents,
      })),
      savings: perMonth.map((point, i) => ({
        period: point.period,
        savingsCents: point.value,
        cumulativeCents: accumulated[i]?.valueCents ?? 0,
      })),
    };
  }
}
