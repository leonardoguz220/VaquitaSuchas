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
 * Un día calendario que la API ya entrega en La Paz (`YYYY-MM-DD`, por ejemplo `nextCutDate`):
 * `formatCalendarDayLaPaz('2026-11-15')` → `15 nov 2026`. No convierte zonas: pasarlo por
 * `new Date` lo leería como medianoche UTC y mostraría el día anterior.
 * Lanza `RangeError` si el texto no tiene esa forma.
 */
export function formatCalendarDayLaPaz(day: string): string {
  const match = CALENDAR_DAY.exec(day);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) {
    throw new RangeError('Día inválido: se esperaba YYYY-MM-DD.');
  }
  return `${Number(match[3])} ${MONTHS[month - 1]} ${match[1]}`;
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const PERIOD = /^(\d{4})-(\d{2})$/;

/**
 * Período de cobro que entrega la API (`YYYY-MM`) como texto: `formatPeriod('2026-10')` →
 * `Octubre 2026`. Lanza `RangeError` si el texto no tiene esa forma.
 */
export function formatPeriod(period: string): string {
  const match = PERIOD.exec(period);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) {
    throw new RangeError('Período inválido: se esperaba YYYY-MM.');
  }
  return `${MONTH_NAMES[month - 1]} ${match[1]}`;
}

/**
 * Los `count` meses calendario de La Paz que terminan en el de `now`, del más reciente al más
 * antiguo (`YYYY-MM`). Solo arma las opciones de un filtro; el servidor decide qué cobros hay.
 */
export function recentPeriods(now: string | Date, count: number): string[] {
  const { year, month } = toLaPazParts(now);
  return Array.from({ length: count }, (_, index) => {
    const zeroBased = year * 12 + (month - 1) - index;
    return `${Math.floor(zeroBased / 12)}-${pad2((zeroBased % 12) + 1)}`;
  });
}

/**
 * Tiempo restante para mostrar en una cuenta regresiva: `formatRemaining(90061)` →
 * `1 día, 1 hora y 1 minuto`. Menos de un minuto → `menos de 1 minuto`.
 */
export function formatRemaining(totalSeconds: number): string {
  const minutesLeft = Math.floor(Math.max(0, totalSeconds) / 60);
  const days = Math.floor(minutesLeft / 1440);
  const hours = Math.floor((minutesLeft % 1440) / 60);
  const minutes = minutesLeft % 60;
  const plural = (value: number, one: string, many: string) =>
    `${value} ${value === 1 ? one : many}`;
  const parts = [
    days > 0 ? plural(days, 'día', 'días') : null,
    hours > 0 ? plural(hours, 'hora', 'horas') : null,
    minutes > 0 ? plural(minutes, 'minuto', 'minutos') : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return 'menos de 1 minuto';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * Plazo corto de una solicitud de ingreso (plan 010 §6): `Faltan 3 días y 4 h`, `Faltan 5 h
 * 20 min`, `Faltan 12 min`. Solo da formato a los segundos que entrega la cuenta regresiva.
 */
export function formatTimeLeft(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return 'Falta menos de 1 minuto';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) {
    const daysText = `${days} ${days === 1 ? 'día' : 'días'}`;
    return hours > 0 ? `Faltan ${daysText} y ${hours} h` : `Faltan ${daysText}`;
  }
  if (hours > 0) return `Faltan ${hours} h ${minutes} min`;
  return `Faltan ${minutes} min`;
}

/** Reloj de un plazo de minutos (plan 010 §6): `12:34`, o `1:02:05` si pasa de una hora. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(rest)}` : `${pad2(minutes)}:${pad2(rest)}`;
}

/**
 * Período `YYYY-MM` corto para ejes de gráficos: `formatPeriodShort('2026-10')` → `oct 2026`.
 * Lanza `RangeError` si el texto no es un período válido.
 */
export function formatPeriodShort(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) {
    throw new RangeError('Período inválido: se esperaba YYYY-MM.');
  }
  return `${MONTHS[month - 1]} ${match[1]}`;
}
