import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import { calendarEventsFor, type CalendarEvent } from '../domain/calendar-events.js';
import { ReportsRepository } from '../repositories/reports.repository.js';

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const shift = (year: number, month: number, delta: number): string => {
  const index = year * 12 + (month - 1) + delta;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
};

/** Calendario de cortes y vencimientos (spec 006, US4): junta ciclos reales y cálculos futuros. */
@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly reports: ReportsRepository,
  ) {}

  private async eventsOfMonths(
    userId: string,
    months: readonly string[],
  ): Promise<CalendarEvent[]> {
    const [groups, charges, cycles] = await Promise.all([
      this.reports.calendarGroups(this.db, userId),
      this.reports.calendarCharges(this.db, userId, months),
      this.reports.ownerCycles(this.db, userId, months),
    ]);
    const today = this.clock.now();
    const all = [...charges, ...cycles];
    return months.flatMap((month) => calendarEventsFor(month, groups, all, today));
  }

  /** `GET /me/calendar?month=` (RF-006-11). */
  async month(
    userId: string,
    month: string | null,
  ): Promise<{ month: string; events: CalendarEvent[] }> {
    const now = toLaPazParts(this.clock.now());
    const target = month ?? `${pad(now.year, 4)}-${pad(now.month)}`;
    return { month: target, events: await this.eventsOfMonths(userId, [target]) };
  }

  /** `GET /me/calendar/upcoming?days=` (RF-006-11): desde hoy hasta hoy + `days` en La Paz. */
  async upcoming(userId: string, days: number): Promise<{ events: CalendarEvent[] }> {
    const now = toLaPazParts(this.clock.now());
    const end = toLaPazParts(new Date(this.clock.now().getTime() + days * 86_400_000));
    const months: string[] = [];
    for (let m = shift(now.year, now.month, 0); m <= `${pad(end.year, 4)}-${pad(end.month)}`;) {
      months.push(m);
      const [y, mo] = m.split('-').map(Number) as [number, number];
      m = shift(y, mo, 1);
    }
    const from = `${pad(now.year, 4)}-${pad(now.month)}-${pad(now.day)}`;
    const to = `${pad(end.year, 4)}-${pad(end.month)}-${pad(end.day)}`;
    const events = (await this.eventsOfMonths(userId, months)).filter(
      (e) => e.date >= from && e.date <= to,
    );
    return { events };
  }
}
