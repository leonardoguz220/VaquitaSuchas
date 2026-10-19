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

export type LoginFormErrorKind = 'connection' | 'general';

export interface LoginFormError {
  /** `connection` muestra el botón "Reintentar". */
  kind: LoginFormErrorKind;
  message: string;
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
      (first && FIELD_CODE_MESSAGES[first]) ?? LOGIN_ERROR_MESSAGES.invalidField;
  }
  return errors;
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
    case 'RATE_LIMITED':
      // La cuenta regresiva y el botón deshabilitado llegan con T032.
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: rateLimitedMessage(error.details) },
      };
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
