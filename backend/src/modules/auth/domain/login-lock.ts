export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_LOCK_MS = 15 * 60_000;

export interface LoginLockStatus {
  locked: boolean;
  until: Date | null;
}

// RF-003-17: ≥ 5 fallos en 15 min bloquean hasta 15 min después del 5.º fallo de la ventana.
export function loginLockStatus(failureTimestamps: Date[], now: Date): LoginLockStatus {
  const windowStart = now.getTime() - LOGIN_WINDOW_MS;
  const recent = failureTimestamps
    .map((d) => d.getTime())
    .filter((t) => t > windowStart && t <= now.getTime())
    .sort((a, b) => a - b);
  if (recent.length < LOGIN_MAX_FAILURES) return { locked: false, until: null };
  const until = recent[LOGIN_MAX_FAILURES - 1] + LOGIN_LOCK_MS;
  return until > now.getTime()
    ? { locked: true, until: new Date(until) }
    : { locked: false, until: null };
}

// RF-003-18: máximo 3 pedidos de recuperación por correo cada hora.
export function resetRequestAllowed(count: number, limit = 3): boolean {
  return count < limit;
}
