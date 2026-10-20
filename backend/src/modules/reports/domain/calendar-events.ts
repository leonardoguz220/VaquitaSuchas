import { toLaPazParts, startOfLaPazDay } from '../../../shared/domain/la-paz.js';
import { adjustBillingDay } from '../../subscriptions/domain/billing-calendar.js';
import { splitShares } from '../../subscriptions/domain/shares.js';

export type CalendarRole = 'miembro' | 'titular';

export interface CalendarGroup {
  groupId: string;
  groupName: string;
  serviceName: string;
  role: CalendarRole;
  billingDay: number;
  closed: boolean;
  memberCount: number;
  totalBsCents: number;
}

export interface CalendarCharge {
  chargeId: string;
  groupId: string;
  /** `AAAA-MM` del corte. */
  period: string;
  amountCents: number;
  status: string;
  dueAt: Date;
}

export interface CalendarEvent {
  date: string;
  kind: 'corte' | 'vencimiento';
  groupId: string;
  groupName: string;
  serviceName: string;
  role: CalendarRole;
  amountCents: number;
  estimated: boolean;
  chargeId: string | null;
  status: string | null;
}

const OPEN_STATUSES = new Set(['pendiente', 'atrasado']);

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const dateString = (y: number, m: number, d: number): string => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Último día de pago: el día de La Paz anterior al instante exclusivo `dueAt`. */
export function lastPayDay(dueAt: Date): string {
  const p = toLaPazParts(new Date(dueAt.getTime() - 1));
  return dateString(p.year, p.month, p.day);
}

/** Días de atraso en calendario de La Paz (0 si aún no vence). */
export function daysLate(dueAt: Date, today: Date): number {
  const due = toLaPazParts(dueAt);
  const now = toLaPazParts(today);
  const dueDay = startOfLaPazDay(due.year, due.month, due.day).getTime();
  const nowDay = startOfLaPazDay(now.year, now.month, now.day).getTime();
  return Math.max(0, Math.round((nowDay - dueDay) / 86_400_000));
}

/**
 * Eventos del calendario de `month` (`AAAA-MM`): cortes de cada grupo (ajustados al último día del
 * mes, RN-001-06) y vencimientos de cobros abiertos. Sin cobro existente el monto es estimado
 * con `splitShares`. Los grupos cerrados solo aparecen en meses pasados (CA-006-13).
 */
export function calendarEventsFor(
  month: string,
  groups: readonly CalendarGroup[],
  charges: readonly CalendarCharge[],
  today: Date,
): CalendarEvent[] {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const now = toLaPazParts(today);
  const isPastMonth = year * 12 + mon < now.year * 12 + now.month;
  const byGroup = new Map(groups.map((g) => [g.groupId, g]));
  const events: CalendarEvent[] = [];

  for (const group of groups) {
    if (group.closed && !isPastMonth) continue;
    const charge = charges.find((c) => c.groupId === group.groupId && c.period === month);
    let amountCents: number;
    if (charge) amountCents = charge.amountCents;
    else {
      const shares = splitShares(group.totalBsCents, Math.max(1, group.memberCount));
      amountCents = group.role === 'titular' ? shares.ownerShareCents : shares.baseShareCents;
    }
    events.push({
      date: dateString(year, mon, adjustBillingDay(year, mon, group.billingDay)),
      kind: 'corte',
      groupId: group.groupId,
      groupName: group.groupName,
      serviceName: group.serviceName,
      role: group.role,
      amountCents,
      estimated: !charge,
      chargeId: charge?.chargeId ?? null,
      status: charge?.status ?? null,
    });
  }

  for (const charge of charges) {
    if (!OPEN_STATUSES.has(charge.status)) continue;
    const group = byGroup.get(charge.groupId);
    if (!group) continue;
    const date = lastPayDay(charge.dueAt);
    if (!date.startsWith(`${month}-`)) continue;
    events.push({
      date,
      kind: 'vencimiento',
      groupId: group.groupId,
      groupName: group.groupName,
      serviceName: group.serviceName,
      role: group.role,
      amountCents: charge.amountCents,
      estimated: false,
      chargeId: charge.chargeId,
      status: charge.status,
    });
  }

  return events.sort((a, b) =>
    a.date === b.date ? a.kind.localeCompare(b.kind) : a.date.localeCompare(b.date),
  );
}
