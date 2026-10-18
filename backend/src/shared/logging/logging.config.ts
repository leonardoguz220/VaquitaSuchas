import { randomUUID } from 'node:crypto';
import { stdTimeFunctions } from 'pino';
import type { LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';

// Configuración pura de los logs (RF-000-13): sin NestJS, para poder probarla sola.
// Dos barreras contra fugas: (1) lo que se registra de la petición es mínimo y a propósito
// (nunca el cuerpo ni la query) y (2) la redacción de abajo, que protege incluso cuando alguien
// registra un objeto por error.

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const REDACT_CENSOR = '[REDACTED]';

/**
 * Niveles de anidación bajo la raíz del objeto registrado que cubre la redacción por rutas.
 * `pino` solo entiende comodines de un nivel (`*.*.password`): no hay «a cualquier profundidad».
 * Con 5 se cubre, por ejemplo, `err.config.data.user.profile.password`. Cuesta una ruta por clave
 * y nivel, así que el límite es deliberado; por eso además el cuerpo de las peticiones no se
 * registra jamás.
 */
export const MAX_REDACT_DEPTH = 5;

/**
 * Claves cuyo valor nunca debe quedar en un log, en cualquier posición hasta `MAX_REDACT_DEPTH`.
 * Incluye las del contrato (`sessionToken`, `registrationSecret`, `ci`, `phone`, `reference`) y
 * las cabeceras sensibles (`pino` las entrega en minúsculas). `buffer` es el contenido de un
 * archivo subido: un comprobante o un QR jamás se registra.
 */
export const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'sessionToken',
  'accessToken',
  'refreshToken',
  'secret',
  'registrationSecret',
  'apiKey',
  'ci',
  'cedula',
  'phone',
  'phoneNumber',
  'reference',
  'authorization',
  'cookie',
  'set-cookie',
  'x-jobs-token',
  'x-session-token',
  'x-registration-secret',
  'x-telegram-bot-api-secret-token',
  'buffer',
] as const;

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Las rutas de `pino` distinguen mayúsculas. Los clientes HTTP suelen escribir las cabeceras en
 * Title-Case (`Authorization`, `X-Jobs-Token`) y los DTO en PascalCase, así que cada clave se
 * redacta en su forma original y con la primera letra de cada palabra en mayúscula. Otras
 * variantes (`PASSWORD`, `pAssword`) no se cubren.
 */
export function keyVariants(key: string): string[] {
  return [...new Set([key, key.split('-').map(capitalize).join('-')])];
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function selector(key: string, isFirst: boolean): string {
  if (IDENTIFIER.test(key)) return isFirst ? key : `.${key}`;
  return `["${key}"]`;
}

function pathFor(key: string, depth: number): string {
  const wildcards = Array.from({ length: depth }, () => '*').join('.');
  return depth === 0 ? selector(key, true) : `${wildcards}${selector(key, false)}`;
}

/** Rutas explícitas de la tarea T020 y de la auditoría de T032, tal como se leen en el plan. */
const EXPLICIT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-jobs-token"]',
  'req.headers["x-session-token"]',
  'res.headers["set-cookie"]',
  'res.headers["x-session-token"]',
];

export const REDACT_PATHS: readonly string[] = [
  ...new Set([
    ...EXPLICIT_PATHS,
    ...SENSITIVE_KEYS.flatMap(keyVariants).flatMap((key) =>
      Array.from({ length: MAX_REDACT_DEPTH + 1 }, (_, depth) => pathFor(key, depth)),
    ),
  ]),
];

// --- Identificador de petición -------------------------------------------------------------

const MAX_REQUEST_ID_LENGTH = 64;
// Solo caracteres inocuos: un valor con saltos de línea o comillas permitiría falsificar líneas
// del log o inyectar cabeceras de respuesta.
const REQUEST_ID_PATTERN = new RegExp(`^[A-Za-z0-9._-]{1,${MAX_REQUEST_ID_LENGTH}}$`);

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/** Usa el `X-Request-Id` recibido si es válido; si falta o no lo es, genera un UUID v4. */
export function resolveRequestId(received: unknown, generate: () => string = randomUUID): string {
  return isValidRequestId(received) ? received : generate();
}

// --- Niveles ---------------------------------------------------------------------------------

/** `test` en silencio para no ensuciar Jest; `development` con detalle; el resto como producción. */
export function levelForEnvironment(nodeEnv: string | undefined): LevelWithSilent {
  if (nodeEnv === 'test') return 'silent';
  if (nodeEnv === 'development') return 'debug';
  return 'info';
}

const HEALTH_PATH = '/health';
const SERVER_ERROR = 500;
const CLIENT_ERROR = 400;

function pathOf(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * Nivel de la línea «request completed». `/health` lo consulta Render cada pocos segundos: si
 * responde bien se baja a `debug` para no llenar el log (si falla, sube a `error` como cualquier
 * 5xx).
 */
export function levelForResponse(
  url: string,
  statusCode: number,
  error?: Error,
): Exclude<LevelWithSilent, 'silent' | 'fatal' | 'trace'> {
  if (error || statusCode >= SERVER_ERROR) return 'error';
  if (statusCode >= CLIENT_ERROR) return 'warn';
  return pathOf(url) === HEALTH_PATH ? 'debug' : 'info';
}

// --- Qué se registra de la petición -----------------------------------------------------------

interface SerializedRequestInput {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  [other: string]: unknown;
}

/**
 * Registra solo identificador, método, ruta SIN query y cabeceras (estas pasan por la
 * redacción). No registra `query` ni `params` (llevan códigos o tokens) ni la dirección remota.
 */
export function serializeRequest(request: SerializedRequestInput): {
  id: unknown;
  method: string | undefined;
  url: string | undefined;
  headers: Record<string, unknown> | undefined;
} {
  return {
    id: request.id,
    method: request.method,
    url: request.url === undefined ? undefined : pathOf(request.url),
    headers: request.headers,
  };
}

// --- Opciones de pino-http ---------------------------------------------------------------------

export interface LoggingOptions {
  /** Por defecto, `NODE_ENV`. */
  nodeEnv?: string | undefined;
  /** Nivel explícito; si falta se deduce del entorno. */
  level?: LevelWithSilent | undefined;
}

export function buildPinoHttpOptions({ nodeEnv, level }: LoggingOptions): Options {
  return {
    level: level ?? levelForEnvironment(nodeEnv),
    redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    // `reqId` queda en cada línea de la petición, incluidas las del Logger de Nest.
    quietReqLogger: true,
    genReqId: (request, response) => {
      const requestId = resolveRequestId(request.headers['x-request-id']);
      // Se devuelve en toda respuesta: éxito, errores del filtro y 401/403 de los guards.
      response.setHeader(REQUEST_ID_HEADER, requestId);
      return requestId;
    },
    customLogLevel: (request, response, error) =>
      levelForResponse(request.url ?? '', response.statusCode, error),
    serializers: { req: serializeRequest },
  };
}
