// Formato de fechas en America/La_Paz (RF-000-17, RN-000-01, CA-000-12).
// Las fechas llegan de la API en UTC y solo se convierten a La Paz al mostrarlas.
// Intl.DateTimeFormat da los números del día en La Paz; el texto se arma a mano para que
// la salida no dependa de la versión de ICU (abreviaturas con punto, espacios no separables).

const TIME_ZONE = 'America/La_Paz';
const LOCALE = 'es-BO';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const partsFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
  numberingSystem: 'latn',
});

interface LaPazParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toDate(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Fecha inválida: se esperaba una fecha ISO 8601.');
  }
  return date;
}

function toLaPazParts(value: string | Date): LaPazParts {
  const parts = partsFormatter.formatToParts(toDate(value));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return Number(part?.value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Algunas versiones de ICU devuelven 24 para la medianoche aun con h23.
    hour: read('hour') % 24,
    minute: read('minute'),
  };
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

function dateText({ year, month, day }: LaPazParts): string {
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * Fecha y hora en La Paz: `formatDateTimeLaPaz('2026-03-01T02:00:00Z')` → `28 feb 2026, 22:00`.
 * Acepta una cadena ISO 8601 o un `Date`. Lanza `RangeError` si la fecha es inválida.
 */
export function formatDateTimeLaPaz(iso: string | Date): string {
  const parts = toLaPazParts(iso);
  return `${dateText(parts)}, ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/**
 * Solo la fecha en La Paz: `formatDateLaPaz('2026-03-01T02:00:00Z')` → `28 feb 2026`.
 * Lanza `RangeError` si la fecha es inválida.
 */
export function formatDateLaPaz(iso: string | Date): string {
  return dateText(toLaPazParts(iso));
}

/**
 * Día calendario en La Paz como `YYYY-MM-DD`: `lapazDayOf('2026-03-01T02:00:00Z')` → `2026-02-28`.
 * Sirve para agrupar o comparar por día; no calcula vencimientos (eso lo hace el backend).
 * Lanza `RangeError` si la fecha es inválida.
 */
export function lapazDayOf(iso: string | Date): string {
  const { year, month, day } = toLaPazParts(iso);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha de calendario que la API ya entrega en La Paz (`YYYY-MM-DD`, por ejemplo `nextCutDate`
 * de la spec 001), sin convertir de zona: `formatCalendarDate('2026-11-01')` → `1 nov 2026`.
 * Lanza `RangeError` si el texto no es una fecha válida.
 */
export function formatCalendarDate(day: string): string {
  const match = CALENDAR_DAY.exec(day);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const date = Number(match?.[3]);
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (
    !match ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== date
  ) {
    throw new RangeError('Fecha inválida: se esperaba YYYY-MM-DD.');
  }
  return dateText({ year, month, day: date, hour: 0, minute: 0 });
}
