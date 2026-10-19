import { daysInMonth, startOfLaPazDay, toLaPazParts } from '../../../shared/domain/la-paz.js';

/** Fecha de calendario en La Paz (month de 1 a 12). */
export interface LaPazDate {
  year: number;
  month: number;
  day: number;
}

/** Día de cobro real del mes: 29, 30 o 31 se ajustan al último día (RN-001-06). */
export function adjustBillingDay(year: number, month: number, billingDay: number): number {
  return Math.min(billingDay, daysInMonth(year, month));
}

/** Fecha de corte del mes dado. */
export function cutDateFor(year: number, month: number, billingDay: number): LaPazDate {
  return { year, month, day: adjustBillingDay(year, month, billingDay) };
}

/** Período `AAAA-MM` del corte. */
export function periodOf(cutDate: LaPazDate): string {
  return `${String(cutDate.year).padStart(4, '0')}-${String(cutDate.month).padStart(2, '0')}`;
}

/** Instante exclusivo de vencimiento: inicio del día `corte + 4` en La Paz (research R2). */
export function dueAtFor(cutDate: LaPazDate): Date {
  return startOfLaPazDay(cutDate.year, cutDate.month, cutDate.day + 4);
}

const cutInstant = (cut: LaPazDate): Date => startOfLaPazDay(cut.year, cut.month, cut.day);

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Primer corte regular cuyo inicio es posterior a `now`. */
export function nextCutAfter(now: Date, billingDay: number): LaPazDate {
  const { year, month } = toLaPazParts(now);
  for (let delta = 0; delta <= 1; delta++) {
    const m = shiftMonth(year, month, delta);
    const cut = cutDateFor(m.year, m.month, billingDay);
    if (cutInstant(cut).getTime() > now.getTime()) return cut;
  }
  throw new Error('No se pudo calcular el siguiente corte.');
}

/** El mayor entre `createdAt` y el último corte regular ≤ `now` (la creación cuenta como corte inicial). */
export function lastCutAtOrBefore(now: Date, billingDay: number, createdAt: Date): Date {
  const { year, month } = toLaPazParts(now);
  for (let delta = 0; delta >= -1; delta--) {
    const m = shiftMonth(year, month, delta);
    const instant = cutInstant(cutDateFor(m.year, m.month, billingDay));
    if (instant.getTime() <= now.getTime()) {
      return instant.getTime() > createdAt.getTime() ? instant : createdAt;
    }
  }
  throw new Error('No se pudo calcular el último corte.');
}
