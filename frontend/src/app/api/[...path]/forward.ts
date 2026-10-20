/**
 * Proxy `/api/[...path]` hacia el backend (RF-000-15, contrato C de
 * `specs/000-setup-del-proyecto/contracts/api.md`). Corre solo en el servidor.
 */
import {
  REGISTRATION_COOKIE,
  REGISTRATION_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readCookie,
  serializeClearedCookie,
  serializeCookie,
} from '@/lib/session-cookies';

/** 30 s por petición: cubre el arranque en frío del backend en Render (contrato C). */
export const DEFAULT_TIMEOUT_MS = 30_000;

const API_PREFIX = '/api/';

/** Encabezados de la petición que llegan al backend (contrato C). */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'x-request-id'];

/** Encabezados de la respuesta que llegan al navegador; nunca `Set-Cookie`. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'x-request-id',
  'retry-after',
  'cache-control',
];

const SESSION_TOKEN_HEADER = 'x-session-token';
const REGISTRATION_SECRET_HEADER = 'x-registration-secret';
const REGISTRATION_SUBPATH_PREFIX = 'auth/register/';
const LOGOUT_PATH = 'auth/logout';

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

type ProxyErrorCode = 'VALIDATION_ERROR' | 'SERVICE_UNAVAILABLE' | 'UPSTREAM_TIMEOUT';

const ERRORS: Record<ProxyErrorCode, { statusCode: number; message: string }> = {
  VALIDATION_ERROR: { statusCode: 400, message: 'La ruta solicitada no es válida.' },
  SERVICE_UNAVAILABLE: { statusCode: 503, message: 'No se pudo contactar con el servidor.' },
  UPSTREAM_TIMEOUT: {
    statusCode: 504,
    message: 'El servidor tardó demasiado en responder. Intenta de nuevo en unos segundos.',
  },
};

export interface ProxyOptions {
  /** Tiempo máximo de espera de la respuesta del backend, en milisegundos. */
  timeoutMs?: number;
}

/** Lo que el proxy hace con las cookies al responder. */
interface CookieActions {
  session?: string | null;
  registration?: string | null;
}

/**
 * Valida los segmentos crudos de la ruta y devuelve la ruta relativa decodificada
 * (`groups/abc`), o `null` si hay segmentos vacíos, `.`/`..`, barras, barras invertidas,
 * esquemas, caracteres de control o una codificación inválida.
 */
function parseProxyPath(pathname: string): string[] | null {
  if (!pathname.startsWith(API_PREFIX)) return null;
  const rawSegments = pathname.slice(API_PREFIX.length).split('/');
  const segments: string[] = [];
  for (const raw of rawSegments) {
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (/[/\\:\u0000-\u001f\u007f]/.test(segment)) return null;
    segments.push(segment);
  }
  return segments;
}

/** Construye la URL del backend y comprueba que no salga del origen ni del prefijo de `BACKEND_URL`. */
function buildTargetUrl(backendUrl: string, segments: string[], search: string): URL | null {
  let base: URL;
  try {
    base = new URL(backendUrl);
  } catch {
    return null;
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
  const basePath = base.pathname.replace(/\/+$/, '');
  const target = new URL(`${basePath}/${segments.map(encodeURIComponent).join('/')}`, base.origin);
  target.search = search;
  if (target.origin !== base.origin || !target.pathname.startsWith(`${basePath}/`)) return null;
  return target;
}

function buildUpstreamHeaders(request: Request, relativePath: string): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const cookieHeader = request.headers.get('cookie');
  const sessionToken = readCookie(cookieHeader, SESSION_COOKIE);
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
  if (relativePath.startsWith(REGISTRATION_SUBPATH_PREFIX)) {
    const registrationSecret = readCookie(cookieHeader, REGISTRATION_COOKIE);
    if (registrationSecret) headers.set(REGISTRATION_SECRET_HEADER, registrationSecret);
  }
  return headers;
}

function applyCookies(headers: Headers, actions: CookieActions): void {
  if (actions.session !== undefined) {
    headers.append(
      'set-cookie',
      actions.session === null
        ? serializeClearedCookie(SESSION_COOKIE)
        : serializeCookie(SESSION_COOKIE, actions.session, SESSION_MAX_AGE_SECONDS),
    );
  }
  if (actions.registration !== undefined) {
    headers.append(
      'set-cookie',
      actions.registration === null
        ? serializeClearedCookie(REGISTRATION_COOKIE)
        : serializeCookie(REGISTRATION_COOKIE, actions.registration, REGISTRATION_MAX_AGE_SECONDS),
    );
  }
}

function errorResponse(
  code: ProxyErrorCode,
  request: Request,
  actions: CookieActions = {},
): Response {
  const { statusCode, message } = ERRORS[code];
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  const requestId = request.headers.get('x-request-id');
  if (requestId) headers.set('x-request-id', requestId);
  applyCookies(headers, actions);
  return new Response(JSON.stringify({ statusCode, code, message }), {
    status: statusCode,
    headers,
  });
}

function isJson(contentType: string | null): boolean {
  if (!contentType) return false;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return mime === 'application/json' || mime.endsWith('+json');
}

/**
 * Quita `sessionToken` y `registrationSecret` del cuerpo JSON para que el navegador
 * nunca los vea. Devuelve el cuerpo final y los secretos encontrados.
 */
function extractSecrets(text: string): {
  body: string;
  sessionToken?: string;
  registrationSecret?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { body: text };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { body: text };
  const record = parsed as Record<string, unknown>;
  if (!('sessionToken' in record) && !('registrationSecret' in record)) return { body: text };
  const { sessionToken, registrationSecret, ...rest } = record;
  return {
    body: JSON.stringify(rest),
    sessionToken: typeof sessionToken === 'string' && sessionToken ? sessionToken : undefined,
    registrationSecret:
      typeof registrationSecret === 'string' && registrationSecret ? registrationSecret : undefined,
  };
}

/** Crea el handler del proxy; el tiempo de espera se puede configurar para las pruebas. */
export function createProxyHandler(options: ProxyOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function proxyRequest(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const incomingUrl = new URL(request.url);
    const segments = parseProxyPath(incomingUrl.pathname);
    const relativePath = segments?.join('/') ?? '';
    const isLogout = method === 'POST' && relativePath === LOGOUT_PATH;
    // El cierre de sesión borra ambas cookies pase lo que pase con el backend (contrato C).
    const logoutActions: CookieActions = isLogout ? { session: null, registration: null } : {};

    if (!segments) return errorResponse('VALIDATION_ERROR', request);

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return errorResponse('SERVICE_UNAVAILABLE', request, logoutActions);
    const target = buildTargetUrl(backendUrl, segments, incomingUrl.search);
    if (!target) return errorResponse('SERVICE_UNAVAILABLE', request, logoutActions);

    const hasBody = method !== 'GET' && method !== 'HEAD' && request.body !== null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const init: RequestInit = {
      method,
      headers: buildUpstreamHeaders(request, relativePath),
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    };

    try {
      // El cuerpo se lee completo antes de reenviarlo. Reenviar el stream (duplex 'half') hacía que
      // undici reintentara un POST cuando el backend respondía 401 y fallara con «expected non-null
      // body source», lo que el proxy devolvía como 503.
      if (hasBody) init.body = await request.arrayBuffer();

      const upstream = await fetch(target, init);

      const headers = new Headers();
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }

      const actions: CookieActions = {};
      const renewedToken = upstream.headers.get(SESSION_TOKEN_HEADER);
      if (renewedToken) actions.session = renewedToken;

      const noBody = method === 'HEAD' || NULL_BODY_STATUSES.has(upstream.status);
      let body: BodyInit | null = null;
      if (!noBody && isJson(upstream.headers.get('content-type'))) {
        const extracted = extractSecrets(await upstream.text());
        body = extracted.body;
        if (upstream.ok && extracted.sessionToken) {
          actions.session = extracted.sessionToken;
          // Con la sesión emitida, el secreto de registro ya no sirve.
          if (relativePath.startsWith(REGISTRATION_SUBPATH_PREFIX)) actions.registration = null;
        }
        if (upstream.ok && extracted.registrationSecret) {
          actions.registration = extracted.registrationSecret;
        }
      } else if (!noBody) {
        body = upstream.body;
      }
      clearTimeout(timer);

      if (upstream.status === 401) actions.session = null;
      applyCookies(headers, isLogout ? logoutActions : actions);

      return new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      clearTimeout(timer);
      const code = controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'SERVICE_UNAVAILABLE';
      return errorResponse(code, request, logoutActions);
    }
  };
}
