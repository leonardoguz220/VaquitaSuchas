export type SeriesPoint = { period: string; value: number | null };
export type CumulativePoint = { period: string; valueCents: number; withoutData: boolean };

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

function toIndex(period: string): number {
  const match = PERIOD.exec(period);
  if (!match) throw new Error(`Período inválido: ${period}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Meses consecutivos sin huecos terminando en `endPeriod`: hasta `n`, sin pasar antes del primer
 * mes con datos (CA-006-11). Sin datos (`firstDataPeriod` nulo) devuelve los `n` meses.
 */
export function lastMonths(endPeriod: string, firstDataPeriod: string | null, n = 12): string[] {
  const end = toIndex(endPeriod);
  let start = end - (n - 1);
  if (firstDataPeriod !== null) start = Math.max(start, Math.min(toIndex(firstDataPeriod), end));
  const months: string[] = [];
  for (let i = start; i <= end; i++) months.push(fromIndex(i));
  return months;
}

/**
 * Acumulado del ahorro: `null` cuenta como 0 en la suma pero marca el punto «sin dato» cuando
 * ningún mes hasta ahí tiene dato.
 */
export function cumulative(series: readonly SeriesPoint[]): CumulativePoint[] {
  let running = 0;
  let seenData = false;
  return series.map((point) => {
    if (point.value !== null) {
      running += point.value;
      seenData = true;
    }
    return { period: point.period, valueCents: running, withoutData: !seenData };
  });
}
