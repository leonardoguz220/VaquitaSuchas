export const LOGIN_MAX_FAILURES = 5;
// Umbral por dirección IP (RF-003-17): más alto porque varias personas pueden compartir una IP.
export const LOGIN_IP_MAX_FAILURES = 20;
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_LOCK_MS = 15 * 60_000;

export interface LoginLockStatus {
  locked: boolean;
  until: Date | null;
}

// RF-003-17: ≥ `maxFailures` fallos en 15 min bloquean hasta 15 min después del último que cuenta.
export function loginLockStatus(
  failureTimestamps: Date[],
  now: Date,
  maxFailures = LOGIN_MAX_FAILURES,
): LoginLockStatus {
  const windowStart = now.getTime() - LOGIN_WINDOW_MS;
  const recent = failureTimestamps
    .map((d) => d.getTime())
    .filter((t) => t > windowStart && t <= now.getTime())
    .sort((a, b) => a - b);
  if (recent.length < maxFailures) return { locked: false, until: null };
  const until = recent[maxFailures - 1] + LOGIN_LOCK_MS;
  return until > now.getTime()
    ? { locked: true, until: new Date(until) }
    : { locked: false, until: null };
}

// RF-003-18: máximo 3 pedidos de recuperación por correo cada hora.
export function resetRequestAllowed(count: number, limit = 3): boolean {
  return count < limit;
}
