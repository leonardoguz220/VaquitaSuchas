/**
 * Rutas públicas de la aplicación (plan 000 §6, RF-000-15 y RF-000-16).
 * Las usan `src/proxy.ts` (protección de rutas) y el layout raíz (T037).
 */

/** Pantalla de inicio de sesión a la que se redirige sin sesión. */
export const LOGIN_PATH = '/ingresar';

/** Parámetro de consulta con la ruta a la que volver tras ingresar (spec 003 T029). */
export const NEXT_PARAM = 'next';

/** Rutas que se ven sin sesión; sus subrutas también son públicas. */
export const PUBLIC_ROUTES = ['/ingresar', '/registro', '/recuperar', '/estado'] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/**
 * Indica si `pathname` es una ruta pública o una subruta de ella
 * (`/registro/verificar`, `/recuperar/<token>`), sin aceptar prefijos falsos (`/registrox`).
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Construye la ruta de `/ingresar` que conserva la ruta original (con su query) en `next=`.
 * Para la raíz no agrega `next=`, porque volver a `/` es el comportamiento por defecto.
 */
export function buildLoginRedirect(pathname: string, search: string): string {
  if (pathname === '/' && !search) return LOGIN_PATH;
  const params = new URLSearchParams({ [NEXT_PARAM]: `${pathname}${search}` });
  return `${LOGIN_PATH}?${params.toString()}`;
}

/** Paso 2 del registro: verificar el celular con Telegram (spec 003 T024). */
export const REGISTER_VERIFY_PATH = '/registro/verificar';

/** Parámetro con el código de invitación con el que llega un invitado (specs 001 y 005). */
export const INVITE_CODE_PARAM = 'codigo';

/** Parámetros que las pantallas de acceso se pasan entre sí para no perder el destino. */
const AUTH_CARRY_PARAMS = [INVITE_CODE_PARAM, NEXT_PARAM] as const;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * Construye un enlace entre pantallas de acceso (`/registro` → `/ingresar`) que conserva
 * `codigo` y `next` si venían en la URL (plan 003 §6). Solo toma el primer valor de cada
 * uno; `/ingresar` valida `next` antes de usarlo.
 */
export function buildAuthLink(path: string, searchParams: SearchParamsRecord = {}): string {
  const params = new URLSearchParams();
  for (const key of AUTH_CARRY_PARAMS) {
    const raw = searchParams[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
