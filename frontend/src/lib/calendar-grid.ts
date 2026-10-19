/**
 * Cuadrícula de un mes para la vista de calendario (plan 006 §6). Es solo presentación: ubica
 * los días del calendario en semanas de lunes a domingo. Las fechas de corte y de vencimiento
 * (con el ajuste del día 31, RN-001-06) las calcula el backend; aquí no se calcula ninguna.
 */

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parsePeriod(period: string): { year: number; month: number } {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError('Período inválido: se esperaba YYYY-MM.');
  return { year: Number(match[1]), month: Number(match[2]) };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Período `YYYY-MM` desplazado `delta` meses: `shiftPeriod('2026-12', 1)` → `2027-01`. */
export function shiftPeriod(period: string, delta: number): string {
  const { year, month } = parsePeriod(period);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

/**
 * Semanas del mes, de lunes a domingo, con `null` en los huecos antes del día 1 y después del
 * último: `monthGrid('2026-02')` empieza con tres `null` (el 1 de febrero de 2026 es domingo…).
 * Cada día es `YYYY-MM-DD`.
 */
export function monthGrid(period: string): Array<Array<string | null>> {
  const { year, month } = parsePeriod(period);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay: 0 = domingo. Con la semana desde el lunes, el domingo va al final.
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

/** Nombres cortos de los días, de lunes a domingo. */
export const WEEKDAYS = [
  { short: 'lun', long: 'lunes' },
  { short: 'mar', long: 'martes' },
  { short: 'mié', long: 'miércoles' },
  { short: 'jue', long: 'jueves' },
  { short: 'vie', long: 'viernes' },
  { short: 'sáb', long: 'sábado' },
  { short: 'dom', long: 'domingo' },
] as const;
