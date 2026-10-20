// Reintentos de envío (RF-005-20): 5 minutos, 30 minutos y 2 horas; el siguiente fallo deja el
// envío como `failed` (la notificación dentro de la app no se toca). `attempts` es el número de
// intentos fallidos incluido el que acaba de ocurrir (la base admite hasta 4).

const MINUTE_MS = 60 * 1000;
export const RETRY_DELAYS_MS: readonly number[] = [5 * MINUTE_MS, 30 * MINUTE_MS, 120 * MINUTE_MS];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export type RetryDecision = { status: 'pending'; nextAttemptAt: Date } | { status: 'failed' };

export function nextRetry(attempts: number, now: Date): RetryDecision {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('Los intentos fallidos deben ser un entero de 1 o más.');
  }
  const delay = RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined
    ? { status: 'failed' }
    : { status: 'pending', nextAttemptAt: new Date(now.getTime() + delay) };
}
