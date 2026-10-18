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
