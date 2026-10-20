// Límite del disparador de tareas `POST /internal/jobs/tick` (RF-000-14, plan §7): como máximo una
// llamada por segundo. Función pura: el instante llega como parámetro (`now`).

/** Separación mínima entre dos llamadas aceptadas del tick. */
export const TICK_MIN_INTERVAL_MS = 1000;

export type TickRateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * ¿Se acepta la llamada? `lastAllowedAt` es el instante de la última llamada ACEPTADA (las
 * rechazadas no cuentan: si contaran, un cron que insiste nunca recuperaría el cupo). Si el reloj
 * del sistema retrocedió (`now` anterior a `lastAllowedAt`) se acepta, para no bloquear el tick
 * más de una ventana por un ajuste del reloj.
 */
export function decideTickRate(
  lastAllowedAt: Date | null,
  now: Date,
  minIntervalMs: number = TICK_MIN_INTERVAL_MS,
): TickRateDecision {
  if (lastAllowedAt === null) {
    return { allowed: true };
  }
  const elapsedMs = now.getTime() - lastAllowedAt.getTime();
  if (elapsedMs < 0 || elapsedMs >= minIntervalMs) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterSeconds: Math.ceil((minIntervalMs - elapsedMs) / 1000) };
}
