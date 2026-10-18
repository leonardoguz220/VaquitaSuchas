import { createHmac } from 'node:crypto';
import type { SessionClaims } from '../ports/auth-session.port.js';
import { constantTimeEquals } from './constant-time.js';

// JWT HS256 mínimo con `node:crypto`: la spec 003 fija un único formato (HS256 con `sub`, `sv`,
// `iat`, `exp`) y evita así una dependencia nueva. No es un JWT genérico: lo que no encaja exacto
// se rechaza, sin decir por qué (el guard responde igual en todos los casos).

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGORITHM = 'HS256';

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

/** Firma un token de sesión. Lo usa `SessionService.issue` (spec 003) y las pruebas. */
export function signHs256Jwt(claims: Record<string, unknown>, secret: string): string {
  const signingInput = `${encode({ alg: ALGORITHM, typ: 'JWT' })}.${encode(claims)}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

function parseObject(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Verifica firma, algoritmo, forma de los claims y vencimiento. Devuelve los claims o `null`;
 * nunca lanza ni informa del motivo. `nowMs` lo aporta el llamador (viene del `Clock`).
 */
export function verifyHs256Jwt(token: string, secret: string, nowMs: number): SessionClaims | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments.every((segment) => SEGMENT.test(segment))) return null;
  const [headerPart, payloadPart, signaturePart] = segments as [string, string, string];

  // El algoritmo se fija aquí y no se toma del token: rechaza `none` y cambios de algoritmo.
  if (parseObject(headerPart)?.['alg'] !== ALGORITHM) return null;

  // Se compara el texto base64url canónico, así una firma con relleno o bits extra no pasa.
  if (!constantTimeEquals(signaturePart, sign(`${headerPart}.${payloadPart}`, secret))) return null;

  const payload = parseObject(payloadPart);
  if (!payload) return null;
  const { sub, sv, iat, exp } = payload;
  if (typeof sub !== 'string' || !UUID.test(sub)) return null;
  if (!isNonNegativeInteger(sv) || !isNonNegativeInteger(iat) || !isNonNegativeInteger(exp)) {
    return null;
  }
  if (exp <= Math.floor(nowMs / 1000)) return null;

  return { sub, sv, iat, exp };
}
