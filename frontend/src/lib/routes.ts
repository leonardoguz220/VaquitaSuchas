/**
 * Rutas públicas de la aplicación (plan 000 §6, RF-000-15 y RF-000-16).
 * Las usan `src/proxy.ts` (protección de rutas) y el layout raíz (T037).
 */

/** Pantalla de inicio de sesión a la que se redirige sin sesión. */
export const LOGIN_PATH = '/ingresar';

/** Parámetro de consulta con la ruta a la que volver tras ingresar (spec 003 T029). */
export const NEXT_PARAM = 'next';

/**
 * Rutas que se ven sin sesión; sus subrutas también son públicas. `/avisos/desactivar` es la
 * página del enlace para dejar de recibir un tipo de correo (plan 005 §6, RF-005-18).
 */
export const PUBLIC_ROUTES = [
  '/ingresar',
  '/registro',
  '/recuperar',
  '/estado',
  '/avisos/desactivar',
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/** Pantalla de desarrollo del bot de Telegram (plan 003 §6, spec 003 T024). */
export const DEV_TELEGRAM_PATH = '/dev/telegram';

/**
 * Indica si el bot corre en modo de desarrollo (`NEXT_PUBLIC_TELEGRAM_MODE=dev`). Next.js
 * reemplaza la variable al compilar; se lee en cada llamada para poder probar ambos casos.
 */
export function isTelegramDevMode(): boolean {
  return process.env.NEXT_PUBLIC_TELEGRAM_MODE === 'dev';
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Indica si `pathname` es una ruta pública o una subruta de ella
 * (`/registro/verificar`, `/recuperar/<token>`), sin aceptar prefijos falsos (`/registrox`).
 * `/dev/telegram` es pública solo en modo de desarrollo del bot; no está en `PUBLIC_ROUTES`.
 */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.some((route) => matchesRoute(pathname, route))) return true;
  return isTelegramDevMode() && matchesRoute(pathname, DEV_TELEGRAM_PATH);
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

/** Paso 1 del registro: los datos de la cuenta (spec 003 T023). */
export const REGISTER_PATH = '/registro';

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

/** Pantalla para pedir el enlace de recuperación de contraseña (spec 003 T035). */
export const RECOVER_PATH = '/recuperar';

/**
 * "Unirme con un código" (plan 010 §6): acepta `?codigo=XXXXXXXX` del enlace de invitación.
 * Ruta protegida: sin sesión, `proxy.ts` lleva a `/ingresar?next=/unirse?codigo=…`.
 */
export const JOIN_PATH = '/unirse';

/** "Mis suscripciones" (plan 001 §6): inicio de quien tiene sesión. Ruta protegida. */
export const GROUPS_PATH = '/grupos';

/** Asistente "Crear suscripción" (plan 001 §6). Ruta protegida. */
export const NEW_GROUP_PATH = '/grupos/nuevo';

/** Detalle de un grupo (plan 001 §6). Ruta protegida. */
export function groupPath(groupId: string): string {
  return `${GROUPS_PATH}/${encodeURIComponent(groupId)}`;
}

/** "Mis cobros" (plan 002 §6). Ruta protegida. */
export const CHARGES_PATH = '/cobros';

/** Detalle de un cobro (plan 002 §6). Ruta protegida. */
export function chargePath(chargeId: string): string {
  return `${CHARGES_PATH}/${encodeURIComponent(chargeId)}`;
}

/** "Mis solicitudes" de ingreso (plan 010 §6). Ruta protegida. */
export const REQUESTS_PATH = '/solicitudes';

/** Detalle de una solicitud de ingreso, con su chat (plan 010 §6). Ruta protegida. */
export function requestPath(requestId: string): string {
  return `${REQUESTS_PATH}/${encodeURIComponent(requestId)}`;
}

/** Enlace a "Unirme con un código" con el código ya puesto (`/unirse?codigo=…`, plan 010 §6). */
export function buildJoinPath(inviteCode: string): string {
  return `${JOIN_PATH}?${new URLSearchParams({ [INVITE_CODE_PARAM]: inviteCode }).toString()}`;
}

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
    // Ni el proxy /api (mostraría JSON crudo) ni una pantalla pública (volvería a /ingresar).
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
    if (isPublicPath(url.pathname)) return null;
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

/** Centro de notificaciones (plan 005 §6). Ruta protegida. */
export const NOTIFICATIONS_PATH = '/notificaciones';

/**
 * Devuelve el `link` de una notificación si es una ruta interna de la app (empieza con una sola
 * `/`, sin barras invertidas ni caracteres de control), o `null`. El backend ya lo restringe;
 * esto evita abrir un enlace externo si llegara uno por error.
 */
export function safeInternalLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  if (/[\x00-\x20\x7f]/.test(link)) return null;
  return link;
}

/** Ajustes de avisos por correo y Telegram (plan 005 §6). Ruta protegida. */
export const NOTIFICATION_SETTINGS_PATH = '/ajustes/avisos';

/** Página pública para dejar de recibir un tipo de correo (`?token=`, plan 005 §6). */
export const UNSUBSCRIBE_PATH = '/avisos/desactivar';

/** Panel del usuario (plan 006 §6). Ruta protegida. */
export const PANEL_PATH = '/panel';

/** Calendario de cortes y vencimientos (plan 006 §6). Ruta protegida. */
export const PANEL_CALENDAR_PATH = '/panel/calendario';

/** Historial de cobros con exportación a CSV (plan 006 §6). Ruta protegida. */
export const PANEL_HISTORY_PATH = '/panel/historial';

/** "Mi perfil" (plan 003 §6). Ruta protegida. */
export const PROFILE_PATH = '/perfil';

/** "Mi reputación": calificación, detalle y habilitación como titular (plan 007 §6). Protegida. */
export const PROFILE_REPUTATION_PATH = '/perfil/reputacion';

/** "Mis insignias": obtenidas y por obtener con su avance (plan 007 §6). Protegida. */
export const PROFILE_BADGES_PATH = '/perfil/insignias';

/** "Cupos libres": búsqueda de publicaciones (plan 008 §6). Ruta protegida. */
export const LISTINGS_PATH = '/cupos';

/** Detalle de una publicación de cupos (plan 008 §6). Ruta protegida. */
export function listingPath(listingId: string): string {
  return `${LISTINGS_PATH}/${encodeURIComponent(listingId)}`;
}

/** Tablero del panel de administración (plan 009 §6). Protegida en el servidor por rol. */
export const ADMIN_PATH = '/admin';

/** Usuarios del panel de administración (plan 009 §6). */
export const ADMIN_USERS_PATH = '/admin/usuarios';

/** Ficha de un usuario en el panel de administración (plan 009 §6). */
export function adminUserPath(userId: string): string {
  return `${ADMIN_USERS_PATH}/${encodeURIComponent(userId)}`;
}

/** Habilitación manual de titulares (plan 009 §6). */
export const ADMIN_HOSTS_PATH = '/admin/titulares';

/** Cola de reclamos de ingreso (plan 009 §6). */
export const ADMIN_DISPUTES_PATH = '/admin/reclamos';

/** Detalle de un reclamo con su evidencia (plan 009 §6). */
export function adminDisputePath(disputeId: string): string {
  return `${ADMIN_DISPUTES_PATH}/${encodeURIComponent(disputeId)}`;
}

/** Log de auditoría (plan 009 §6). */
export const ADMIN_AUDIT_PATH = '/admin/auditoria';

/** Catálogo de servicios e importación (plan 009 §6). */
export const ADMIN_CATALOG_PATH = '/admin/catalogo';

/** Indica si `pathname` es una ruta del panel de administración (`/admin` o una subruta). */
export function isAdminPath(pathname: string): boolean {
  return matchesRoute(pathname, ADMIN_PATH);
}

/**
 * Devuelve `url` si es una dirección `https:` (o `http:` en desarrollo) absoluta, por ejemplo la
 * URL firmada de un comprobante, o `null`. Evita abrir `javascript:` u otros esquemas si llegara
 * uno por error.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
