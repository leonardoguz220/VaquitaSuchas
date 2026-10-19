// America/La_Paz es UTC−4 todo el año: Bolivia no usa horario de verano (RN-000-01).
// Esta es la única fuente de esa regla en el backend; el resto del código no suma ni resta horas.
const LA_PAZ_UTC_OFFSET_HOURS = -4;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Fecha y hora de pared en America/La_Paz. */
export interface LaPazParts {
  year: number;
  /** 1 (enero) a 12 (diciembre). */
  month: number;
  /** 1 a 31. */
  day: number;
  /** 0 a 23. */
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 (domingo) a 6 (sábado), como `Date#getDay`. */
  weekday: number;
}

/** Convierte un instante (UTC) a las partes de su fecha local en La Paz. */
export function toLaPazParts(date: Date): LaPazParts {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new Error('Fecha inválida: no se puede convertir a la hora de La Paz.');
  }

  // Al correr el instante, los getters UTC devuelven la hora de pared de La Paz.
  const local = new Date(time + LA_PAZ_UTC_OFFSET_HOURS * MS_PER_HOUR);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    millisecond: local.getUTCMilliseconds(),
    weekday: local.getUTCDay(),
  };
}

/** Cantidad de días del mes (`month` de 1 a 12), con años bisiestos. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Instante en que empieza el día `day` de La Paz (00:00 La Paz = 04:00 UTC). Acepta días fuera de rango: se desbordan al mes siguiente. */
export function startOfLaPazDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -LA_PAZ_UTC_OFFSET_HOURS));
}
