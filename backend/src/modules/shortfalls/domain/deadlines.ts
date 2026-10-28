const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Valores por defecto de configuración (RF-011-04, RF-011-12). */
export interface ShortfallDeadlineConfig {
  respondHours: number;
  /** Desde que el miembro elige cubrir. */
  payHours: number;
  /** Tope total desde la apertura de la ronda. */
  maxPayHours: number;
  /** Días que tiene el titular para registrar una devolución antes de que se pueda disputar. */
  refundDays: number;
}

export const DEFAULT_SHORTFALL_DEADLINES: ShortfallDeadlineConfig = {
  respondHours: 48,
  payHours: 48,
  maxPayHours: 96,
  refundDays: 5,
};

const plus = (base: Date, ms: number): Date => new Date(base.getTime() + ms);

export interface RoundDeadlines {
  respondBy: Date;
  payBy: Date;
}

/** Plazos de una ronda recién abierta (RF-011-04). */
export function computeRoundDeadlines(
  openedAt: Date,
  config: ShortfallDeadlineConfig = DEFAULT_SHORTFALL_DEADLINES,
): RoundDeadlines {
  return {
    respondBy: plus(openedAt, config.respondHours * HOUR),
    payBy: plus(openedAt, config.maxPayHours * HOUR),
  };
}

/** Plazo para pagar al elegir cubrir: `payHours` desde la respuesta, sin pasar del tope de la ronda. */
export function computePayDeadline(
  now: Date,
  payBy: Date,
  config: ShortfallDeadlineConfig = DEFAULT_SHORTFALL_DEADLINES,
): Date {
  const candidate = plus(now, config.payHours * HOUR);
  return candidate.getTime() > payBy.getTime() ? payBy : candidate;
}

/** Fecha desde la cual el miembro puede disputar una devolución que nadie registró. */
export function computeRefundDue(
  openedAt: Date,
  config: ShortfallDeadlineConfig = DEFAULT_SHORTFALL_DEADLINES,
): Date {
  return plus(openedAt, config.refundDays * DAY);
}
