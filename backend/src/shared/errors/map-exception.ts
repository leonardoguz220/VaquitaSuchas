import { HttpException } from '@nestjs/common';
import { DomainError } from './domain-error.js';
import { CODE_BY_STATUS, DEFAULT_MESSAGES, ErrorCode } from './error-codes.js';
import { isValidationErrorList, validationDomainError } from './validation.js';

const PG_UNIQUE_VIOLATION = '23505';

/** Cuerpo de error de `contracts/api.md` A.2. */
export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MappedException {
  /** Lo único que se envía al cliente. */
  body: ErrorBody;
  /** Traza original. Solo para el log; nunca debe entrar en la respuesta. */
  stack?: string;
  /** Contexto extra solo para el log (p. ej. el nombre de la restricción violada). */
  logDetail?: string;
}

function toBody(code: string, statusCode: number, message: string, details?: unknown): ErrorBody {
  const body: ErrorBody = { statusCode, code, message };
  if (details !== undefined) body.details = details as Record<string, unknown>;
  return body;
}

function genericBody(statusCode: number, code: keyof typeof DEFAULT_MESSAGES): ErrorBody {
  return toBody(code, statusCode, DEFAULT_MESSAGES[code]);
}

function fromHttpStatus(status: number): ErrorBody {
  const code = CODE_BY_STATUS[status];
  if (code) return genericBody(status, code);
  // A.3 no cubre este estado: los 4xx se conservan como error de petición y los 5xx se
  // esconden detrás del 500 genérico.
  if (status >= 400 && status < 500) return genericBody(status, ErrorCode.VALIDATION_ERROR);
  return genericBody(500, ErrorCode.INTERNAL_ERROR);
}

/** `http-errors` (body-parser: JSON mal formado, cuerpo muy grande) no es una HttpException de Nest. */
function readExposedClientStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, statusCode, expose } = exception as Record<string, unknown>;
  const value = typeof statusCode === 'number' ? statusCode : status;
  if (expose === true && typeof value === 'number' && value >= 400 && value < 500) return value;
  return undefined;
}

function readPgUniqueViolation(exception: unknown): { constraint?: string } | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { code, constraint } = exception as Record<string, unknown>;
  if (code !== PG_UNIQUE_VIOLATION) return undefined;
  return typeof constraint === 'string' ? { constraint } : {};
}

/**
 * Traduce cualquier cosa lanzada al formato de error uniforme (RF-000-11, CA-000-08). Función
 * pura: decide qué ve el cliente. Del error original solo se reutiliza lo que el autor de un
 * `DomainError` escribió para la persona usuaria; el texto de cualquier otra excepción (Nest,
 * `pg`, `Error`) se descarta y se reemplaza por un mensaje genérico.
 */
export function mapException(exception: unknown): MappedException {
  const stack = exception instanceof Error ? exception.stack : undefined;

  if (exception instanceof DomainError) {
    return {
      body: toBody(exception.code, exception.httpStatus, exception.message, exception.details),
      stack,
    };
  }

  if (isValidationErrorList(exception)) {
    return mapException(validationDomainError(exception));
  }

  if (exception instanceof HttpException) {
    return { body: fromHttpStatus(exception.getStatus()), stack };
  }

  const clientStatus = readExposedClientStatus(exception);
  if (clientStatus !== undefined) {
    return { body: fromHttpStatus(clientStatus), stack };
  }

  const unique = readPgUniqueViolation(exception);
  if (unique) {
    return {
      body: genericBody(409, ErrorCode.CONFLICT),
      stack,
      logDetail: `Violación de unicidad en PostgreSQL (23505)${
        unique.constraint ? `, restricción ${unique.constraint}` : ''
      }`,
    };
  }

  return { body: genericBody(500, ErrorCode.INTERNAL_ERROR), stack };
}
