export const SESSION_TTL_SEC = 7 * 24 * 3600;
export const SESSION_RENEW_BELOW_SEC = 6 * 24 * 3600;

export interface SessionTokenClaims {
  sub: string;
  sv: number;
  iat: number;
  exp: number;
}

export function buildSessionClaims(
  userId: string,
  sessionVersion: number,
  nowSec: number,
): SessionTokenClaims {
  return { sub: userId, sv: sessionVersion, iat: nowSec, exp: nowSec + SESSION_TTL_SEC };
}

// Renovación deslizante (RF-003-07): se emite un token nuevo cuando quedan menos de 6 días.
export function shouldRenewSession(exp: number, nowSec: number): boolean {
  return exp - nowSec < SESSION_RENEW_BELOW_SEC;
}
