/**
 * Traduce los errores de `POST /auth/register` a mensajes de pantalla, siempre por `code`
 * y nunca por `message` (contrato 000 A.2; tabla de errores del contrato 003).
 */
import {
  REGISTER_FIELDS,
  REGISTER_MESSAGES,
  type RegisterField,
  type RegisterFieldErrors,
} from '@/lib/auth-validation';
import { isConnectionError, type ApiError } from '@/services/http';

export type RegisterFormErrorKind = 'connection' | 'general';

export interface RegisterFormError {
  /** `connection` muestra el botón "Reintentar". */
  kind: RegisterFormErrorKind;
  message: string;
}

export interface RegisterErrorView {
  fieldErrors: RegisterFieldErrors;
  formError: RegisterFormError | null;
}

export const REGISTER_ERROR_MESSAGES = {
  emailTaken: 'Ese correo ya está registrado.',
  ciTaken: 'Ya existe una cuenta con esa cédula.',
  notAllowed: 'No es posible crear la cuenta con estos datos.',
  rateLimited: 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  connection: 'No se pudo contactar con el servidor.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  weakPassword:
    'La contraseña debe tener al menos 10 caracteres, una letra y un número, y no ser igual al correo.',
  invalidField: 'Revisa este dato.',
  reviewForm: 'Revisa los datos marcados en el formulario.',
} as const;

/** Mensaje de cada código de campo de `details.fields`; los demás usan `invalidField`. */
const FIELD_CODE_MESSAGES: Record<string, string> = {
  WEAK_PASSWORD: REGISTER_ERROR_MESSAGES.weakPassword,
  INVALID_CI: REGISTER_MESSAGES.ciInvalid,
  POLICY_NOT_ACCEPTED: REGISTER_MESSAGES.policyRequired,
  INVALID_EMAIL: REGISTER_MESSAGES.emailInvalid,
};

function rateLimitedMessage(details: ApiError['details']): string {
  const seconds = details?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return REGISTER_ERROR_MESSAGES.rateLimited;
  }
  const minutes = Math.ceil(seconds / 60);
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return `Hiciste demasiados intentos. Espera ${minutes} ${unit} e inténtalo de nuevo.`;
}

function validationFieldErrors(details: ApiError['details']): RegisterFieldErrors {
  const fields = details?.fields;
  const errors: RegisterFieldErrors = {};
  if (typeof fields !== 'object' || fields === null) return errors;
  const record = fields as Record<string, unknown>;
  for (const field of REGISTER_FIELDS) {
    const codes = record[field];
    if (!Array.isArray(codes) || codes.length === 0) continue;
    const first = codes.find((code): code is string => typeof code === 'string');
    errors[field as RegisterField] =
      (first && FIELD_CODE_MESSAGES[first]) ?? REGISTER_ERROR_MESSAGES.invalidField;
  }
  return errors;
}

/** Decide dónde y qué mostrar para un error del registro. */
export function mapRegisterError(error: ApiError): RegisterErrorView {
  if (isConnectionError(error)) {
    return {
      fieldErrors: {},
      formError: { kind: 'connection', message: REGISTER_ERROR_MESSAGES.connection },
    };
  }

  switch (error.code) {
    case 'EMAIL_TAKEN':
      return { fieldErrors: { email: REGISTER_ERROR_MESSAGES.emailTaken }, formError: null };
    case 'CI_TAKEN':
      return { fieldErrors: { ci: REGISTER_ERROR_MESSAGES.ciTaken }, formError: null };
    case 'REGISTRATION_NOT_ALLOWED':
      // Genérico a propósito: no indica qué dato está bloqueado (RF-003-19).
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: REGISTER_ERROR_MESSAGES.notAllowed },
      };
    case 'RATE_LIMITED':
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: rateLimitedMessage(error.details) },
      };
    case 'VALIDATION_ERROR': {
      const fieldErrors = validationFieldErrors(error.details);
      const hasFields = Object.keys(fieldErrors).length > 0;
      return {
        fieldErrors,
        formError: hasFields
          ? null
          : { kind: 'general', message: REGISTER_ERROR_MESSAGES.reviewForm },
      };
    }
    default:
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: REGISTER_ERROR_MESSAGES.unexpected },
      };
  }
}
