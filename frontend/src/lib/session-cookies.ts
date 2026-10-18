/**
 * Cookies de sesión que maneja el proxy `/api/[...path]` (contrato C de
 * `specs/000-setup-del-proyecto/contracts/api.md`, RF-000-15). Solo se usan en el servidor:
 * son `httpOnly` y el JavaScript del navegador nunca las lee.
 */

/** Token de sesión (JWT) que el proxy envía como `Authorization: Bearer`. */
export const SESSION_COOKIE = 'vq_session';

/** Secreto de registro pendiente de verificación (spec 003, `X-Registration-Secret`). */
export const REGISTRATION_COOKIE = 'vq_reg';

/** Sesión de 7 días, renovada de forma deslizante con `X-Session-Token` (RF-003-07). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** El secreto de registro vence a las 24 h (contrato C y spec 003). */
export const REGISTRATION_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * El contrato C pide `Secure`. Se omite fuera de producción porque en desarrollo y en las
 * pruebas E2E el sitio corre en http://localhost y algunos navegadores descartan una cookie
 * `Secure` recibida por http.
 */
function isSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production';
}

function attributes(maxAgeSeconds: number): string {
  const parts = ['Path=/', `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax'];
  if (isSecureCookie()) parts.push('Secure');
  return parts.join('; ');
}

/** Valor de `Set-Cookie` que guarda `value` en la cookie `name`. */
export function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; ${attributes(maxAgeSeconds)}`;
}

/** Valor de `Set-Cookie` que borra la cookie `name`. */
export function serializeClearedCookie(name: string): string {
  return `${name}=; ${attributes(0)}`;
}

/** Lee la cookie `name` de un encabezado `Cookie`; devuelve `null` si falta o está vacía. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const raw = pair.slice(separator + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
