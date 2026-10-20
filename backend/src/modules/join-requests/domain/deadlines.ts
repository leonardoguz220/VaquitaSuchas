const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Valores por defecto de configuración (RN-010-06). */
export interface DeadlineConfig {
  payMinutes: number;
  extensionMinutes: number;
  decisionMinutes: number;
  reminderMinutes: number;
  openHours: number;
}

export const DEFAULT_DEADLINE_CONFIG: DeadlineConfig = {
  payMinutes: 15,
  extensionMinutes: 15,
  decisionMinutes: 60,
  reminderMinutes: 30,
  openHours: 24,
};

export type DeadlineKind = 'open' | 'paymentData' | 'extension' | 'proof';

export interface DeadlineOptions extends Partial<DeadlineConfig> {
  /** `open`: fin exclusivo de la ventana de ingreso. */
  windowEndExclusive?: Date;
  /** `extension`: plazo de pago actual. */
  currentPayDeadlineAt?: Date;
  /** `extension`: ya se prorrogó una vez. */
  alreadyExtended?: boolean;
}

export interface Deadlines {
  openDeadlineAt?: Date;
  payDeadlineAt?: Date;
  decisionDeadlineAt?: Date;
  reminderAt?: Date;
}

const plus = (base: Date, ms: number): Date => new Date(base.getTime() + ms);

/**
 * Fechas límite según el evento que las inicia, con la hora del servidor (RN-010-06):
 * `open` → 24 h limitado por el fin de la ventana; `paymentData` → 15 min de pago; `extension` →
 * +15 min una sola vez (devuelve `{}` si ya se prorrogó); `proof` → 60 min de decisión y recordatorio a los 30.
 */
export function computeDeadlines(
  kind: DeadlineKind,
  now: Date,
  opts: DeadlineOptions = {},
): Deadlines {
  const cfg = { ...DEFAULT_DEADLINE_CONFIG, ...opts };
  switch (kind) {
    case 'open': {
      const limit = plus(now, cfg.openHours * HOUR);
      const end = opts.windowEndExclusive;
      return { openDeadlineAt: end && end.getTime() < limit.getTime() ? end : limit };
    }
    case 'paymentData':
      return { payDeadlineAt: plus(now, cfg.payMinutes * MINUTE) };
    case 'extension': {
      if (opts.alreadyExtended || !opts.currentPayDeadlineAt) return {};
      return { payDeadlineAt: plus(opts.currentPayDeadlineAt, cfg.extensionMinutes * MINUTE) };
    }
    case 'proof':
      return {
        decisionDeadlineAt: plus(now, cfg.decisionMinutes * MINUTE),
        reminderAt: plus(now, cfg.reminderMinutes * MINUTE),
      };
  }
}
