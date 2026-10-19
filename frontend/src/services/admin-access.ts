/**
 * Comprobación del rol de administrador **en el servidor** (RF-009-01, plan 009 §6). El JWT de
 * sesión solo lleva `sub`, `sv`, `iat` y `exp` (plan 003 §2), así que el rol se conoce con
 * `GET /auth/me` (contrato 003). La usa el layout de `/admin`; corre solo en el servidor y nunca
 * expone el token al navegador. La API igualmente responde `403` a quien no es administrador.
 */

/**
 * `admin`: puede entrar. `forbidden`: tiene sesión pero no es administrador. `unauthenticated`:
 * sin sesión válida (`401`). `unavailable`: no se pudo comprobar (backend caído o mal
 * configurado); el panel no se muestra.
 */
export type AdminAccess = 'admin' | 'forbidden' | 'unauthenticated' | 'unavailable';

/** Tiempo máximo para comprobar el rol; cubre el arranque en frío del backend en Render. */
export const ADMIN_ACCESS_TIMEOUT_MS = 30_000;

function meUrl(backendUrl: string): URL | null {
  try {
    const base = new URL(backendUrl.endsWith('/') ? backendUrl : `${backendUrl}/`);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
    return new URL('auth/me', base);
  } catch {
    return null;
  }
}

/**
 * Pide `GET /auth/me` al backend con el token de la cookie httpOnly y decide el acceso al panel
 * de administración. Ante cualquier duda responde `unavailable` o `forbidden`, nunca `admin`.
 */
export async function checkAdminAccess(
  sessionToken: string | undefined,
  options: { timeoutMs?: number } = {},
): Promise<AdminAccess> {
  if (!sessionToken) return 'unauthenticated';
  const backendUrl = process.env.BACKEND_URL;
  const target = backendUrl ? meUrl(backendUrl) : null;
  if (!target) return 'unavailable';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ADMIN_ACCESS_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status === 401) return 'unauthenticated';
    if (response.status === 403) return 'forbidden';
    if (!response.ok) return 'unavailable';
    const body: unknown = await response.json();
    const role =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>).role : null;
    return role === 'admin' ? 'admin' : 'forbidden';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
