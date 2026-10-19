/**
 * Cliente HTTP común del navegador (contrato A.2 y C de
 * `specs/000-setup-del-proyecto/contracts/api.md`). Todas las llamadas van al proxy
 * `/api/...`, que agrega la sesión desde la cookie httpOnly; este módulo nunca ve tokens.
 */

/** Error de red: el navegador no llegó ni al proxy. */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

/** La respuesta no trae el formato de error A.2 o no es JSON válido. */
export const UNEXPECTED_RESPONSE_CODE = 'UNEXPECTED_RESPONSE';

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/** Estados que significan que el backend no está disponible (proxy: 503 y 504). */
const CONNECTION_STATUSES = new Set([0, 503, 504]);

export type ApiErrorDetails = Record<string, unknown>;

/**
 * Error de la API con el formato A.2. La interfaz decide qué mostrar por `code`,
 * nunca por `message` (contrato A.2).
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Indica si el error significa que no se pudo contactar con el servidor (red, 503 o 504). */
export function isConnectionError(error: unknown): boolean {
  return error instanceof ApiError && CONNECTION_STATUSES.has(error.statusCode);
}

/** Devuelve el mismo `ApiError` o envuelve cualquier otro valor lanzado. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, UNEXPECTED_RESPONSE_CODE, GENERIC_MESSAGE);
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  method?: HttpMethod;
  /** Se envía como JSON. */
  body?: unknown;
  /**
   * Se envía como `multipart/form-data` (subida de archivos, por ejemplo el QR de pago). El
   * navegador pone el `Content-Type` con su `boundary`. No se combina con `body`.
   */
  formData?: FormData;
  /** Permite cancelar la petición (por ejemplo, por un tiempo máximo en el cliente). */
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function errorFromBody(status: number, text: string): ApiError {
  const parsed = parseJson(text);
  if (parsed.ok && isRecord(parsed.value) && typeof parsed.value.code === 'string') {
    const body = parsed.value;
    return new ApiError(
      status,
      body.code as string,
      typeof body.message === 'string' ? body.message : GENERIC_MESSAGE,
      isRecord(body.details) ? body.details : undefined,
    );
  }
  return new ApiError(status, UNEXPECTED_RESPONSE_CODE, GENERIC_MESSAGE);
}

/**
 * Hace una petición JSON a una ruta del proxy (`/api/...`) y devuelve el cuerpo.
 * Lanza `ApiError` si la respuesta no es 2xx, si la red falla o si el cuerpo no es JSON.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined && options.formData === undefined;
  const init: RequestInit = {
    method,
    headers: hasBody
      ? { Accept: 'application/json', 'Content-Type': 'application/json' }
      : { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  };
  if (options.formData) init.body = options.formData;
  else if (hasBody) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, 'No se pudo contactar con el servidor.');
  }

  const text = await response.text();
  if (!response.ok) throw errorFromBody(response.status, text);
  if (text === '') return undefined as T;

  const parsed = parseJson(text);
  if (!parsed.ok) throw new ApiError(response.status, UNEXPECTED_RESPONSE_CODE, GENERIC_MESSAGE);
  return parsed.value as T;
}

/** Archivo descargado de la API (por ejemplo, un CSV de la spec 006). */
export interface ApiDownload {
  blob: Blob;
  /** Nombre que propone el servidor en `Content-Disposition`, o `null` si no lo envía. */
  filename: string | null;
}

/**
 * Lee el nombre de archivo de un encabezado `Content-Disposition`: prefiere `filename*`
 * (RFC 5987, `UTF-8''…`) y si no `filename="…"`. Devuelve solo el nombre, sin rutas.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  let name: string | null = null;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim());
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/.exec(header);
    name = plain ? (plain[1] ?? plain[2] ?? null) : null;
  }
  if (!name) return null;
  const base = name.split(/[\\/]/).pop()?.trim() ?? '';
  return base === '' || base === '.' || base === '..' ? null : base;
}

/**
 * Descarga un archivo de una ruta del proxy (`/api/...`) con `GET`. Devuelve el contenido como
 * `Blob` y el nombre que propone el servidor. Si la respuesta no es 2xx, lanza el `ApiError`
 * del cuerpo JSON (contrato A.2), igual que `apiRequest`; si la red falla, `NETWORK_ERROR`.
 */
export async function apiDownload(
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiDownload> {
  const init: RequestInit = {
    method: 'GET',
    headers: { Accept: 'text/csv, application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  };
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, 'No se pudo contactar con el servidor.');
  }
  if (!response.ok) throw errorFromBody(response.status, await response.text());
  try {
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('content-disposition')),
    };
  } catch {
    throw new ApiError(0, NETWORK_ERROR_CODE, 'No se pudo contactar con el servidor.');
  }
}
