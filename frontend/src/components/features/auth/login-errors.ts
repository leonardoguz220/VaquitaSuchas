/**
 * Traduce los errores de `POST /auth/login` a mensajes de pantalla, siempre por `code` y nunca
 * por `message` (contrato 000 A.2; contrato 003, `POST /auth/login`).
 */
import {
  LOGIN_FIELDS,
  LOGIN_MESSAGES,
  type LoginField,
  type LoginFieldErrors,
} from '@/lib/auth-validation';
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES, rateLimitedMessage } from './register-errors';

export type LoginFormErrorKind = 'connection' | 'general' | 'rateLimited';

export interface LoginFormError {
  /** `connection` muestra el botón "Reintentar"; `rateLimited` muestra la cuenta regresiva. */
  kind: LoginFormErrorKind;
  message: string;
  /** Solo en `rateLimited`: segundos de espera (entero ≥ 1, `details.retryAfterSeconds`). */
  retryAfterSeconds?: number;
}

export interface LoginErrorView {
  fieldErrors: LoginFieldErrors;
  formError: LoginFormError | null;
}

export const LOGIN_ERROR_MESSAGES = {
  /**
   * Igual para correo inexistente, contraseña errónea, cuenta sin verificar, suspendida o
   * baneada (RNF-003-02; CA-003-05, CA-003-18, CA-003-23).
   */
  invalidCredentials: 'Correo o contraseña incorrectos.',
  /** Aviso que reemplaza la cuenta regresiva cuando termina la espera (CA-003-06). */
  rateLimitReady: 'Ya puedes intentarlo de nuevo.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  invalidField: REGISTER_ERROR_MESSAGES.invalidField,
  reviewForm: REGISTER_ERROR_MESSAGES.reviewForm,
} as const;

/** Mensaje de cada código de campo de `details.fields`; los demás usan `invalidField`. */
const FIELD_CODE_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: LOGIN_MESSAGES.emailInvalid,
};

function validationFieldErrors(details: ApiError['details']): LoginFieldErrors {
  const fields = details?.fields;
  const errors: LoginFieldErrors = {};
  if (typeof fields !== 'object' || fields === null) return errors;
  const record = fields as Record<string, unknown>;
  for (const field of LOGIN_FIELDS) {
    const codes = record[field];
    if (!Array.isArray(codes) || codes.length === 0) continue;
    const first = codes.find((code): code is string => typeof code === 'string');
    errors[field as LoginField] =
      (first && FIELD_CODE_MESSAGES[first]) ??
      (field === 'email' ? LOGIN_MESSAGES.emailInvalid : LOGIN_ERROR_MESSAGES.invalidField);
  }
  return errors;
}

/** Segundos de espera válidos de `details.retryAfterSeconds`, o `null` si no sirven. */
export function retryAfterSecondsOf(details: ApiError['details']): number | null {
  const seconds = details?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil(seconds);
}

/** Formato `mm:ss` de un tiempo en segundos (la espera máxima es de 15 minutos). */
export function formatWaitTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Texto completo del aviso de espera con el tiempo restante (CA-003-06). */
export function rateLimitWaitMessage(remainingSeconds: number): string {
  return `Hiciste demasiados intentos. Espera ${formatWaitTime(remainingSeconds)} para volver a intentarlo.`;
}

/** Decide dónde y qué mostrar para un error del inicio de sesión. */
export function mapLoginError(error: ApiError): LoginErrorView {
  if (isConnectionError(error)) {
    return {
      fieldErrors: {},
      formError: { kind: 'connection', message: LOGIN_ERROR_MESSAGES.connection },
    };
  }

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      // Genérico a propósito y sin marcar un campo: no revela cuál falló (RNF-003-02).
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: LOGIN_ERROR_MESSAGES.invalidCredentials },
      };
    case 'RATE_LIMITED': {
      const retryAfterSeconds = retryAfterSecondsOf(error.details);
      if (retryAfterSeconds === null) {
        // Sin espera conocida: aviso estático, sin cuenta regresiva.
        return {
          fieldErrors: {},
          formError: { kind: 'general', message: rateLimitedMessage(error.details) },
        };
      }
      return {
        fieldErrors: {},
        formError: {
          kind: 'rateLimited',
          message: rateLimitWaitMessage(retryAfterSeconds),
          retryAfterSeconds,
        },
      };
    }
    case 'VALIDATION_ERROR': {
      const fieldErrors = validationFieldErrors(error.details);
      const hasFields = Object.keys(fieldErrors).length > 0;
      return {
        fieldErrors,
        formError: hasFields ? null : { kind: 'general', message: LOGIN_ERROR_MESSAGES.reviewForm },
      };
    }
    default:
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: LOGIN_ERROR_MESSAGES.unexpected },
      };
  }
}
