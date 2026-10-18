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

/** Pantalla de registro (spec 003 T023). */
export const REGISTER_PATH = '/registro';

/** Pantalla para pedir el enlace de recuperación de contraseña (spec 003 T035). */
export const RECOVER_PATH = '/recuperar';

/**
 * "Unirme con un código" (plan 010 §6): acepta `?codigo=XXXXXXXX` del enlace de invitación.
 * La pantalla llega con la spec 010.
 */
export const JOIN_PATH = '/unirse';

/** Destino tras ingresar cuando no hay otro: la raíz redirige según la sesión (RF-000-16). */
export const DEFAULT_AFTER_LOGIN_PATH = '/';

/** Base ficticia para resolver rutas relativas y comprobar que no cambian de origen. */
const SAME_ORIGIN_BASE = 'http://vaquita.invalid';

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Devuelve `value` si es una ruta interna segura para redirigir tras ingresar, o `null`.
 * Evita la redirección abierta: exige que empiece con una sola `/` (no `//` ni `/\`), sin
 * esquema (`https:`, `javascript:`), sin barras invertidas ni caracteres de control (el
 * navegador los quita o los cambia por `/`) y que al resolverla no cambie de origen.
 */
export function safeNextPath(value: string | string[] | undefined): string | null {
  const candidate = firstValue(value);
  if (!candidate || !candidate.startsWith('/')) return null;
  if (candidate.startsWith('//') || candidate.includes('\\')) return null;
  // Espacios y caracteres de control (U+0000 a U+0020 y U+007F).
  if (/[\x00-\x20\x7f]/.test(candidate)) return null;
  try {
    const url = new URL(candidate, SAME_ORIGIN_BASE);
    if (url.origin !== SAME_ORIGIN_BASE) return null;
  } catch {
    return null;
  }
  return candidate;
}

/**
 * A dónde ir tras ingresar (spec 003 T029): a `next` si es una ruta interna segura; si no, y
 * llegó un código de invitación, a `/unirse?codigo=…` (plan 010 §6); si no, a `/`.
 */
export function resolvePostLoginPath(searchParams: SearchParamsRecord = {}): string {
  const next = safeNextPath(searchParams[NEXT_PARAM]);
  if (next) return next;
  const code = firstValue(searchParams[INVITE_CODE_PARAM])?.trim();
  if (code) {
    return `${JOIN_PATH}?${new URLSearchParams({ [INVITE_CODE_PARAM]: code }).toString()}`;
  }
  return DEFAULT_AFTER_LOGIN_PATH;
}
