/**
 * Textos y errores de la recuperación de contraseña (`/recuperar` y `/recuperar/[token]`),
 * decididos siempre por `code` y nunca por `message` (contrato 000 A.2; contrato 003,
 * `POST /auth/password/forgot` y `POST /auth/password/reset`).
 */
import {
  LOGIN_MESSAGES,
  REGISTER_MESSAGES,
  RESET_PASSWORD_FIELDS,
  type ForgotPasswordFieldErrors,
  type ResetPasswordField,
  type ResetPasswordFieldErrors,
} from '@/lib/auth-validation';
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES } from './register-errors';

export type RecoverFormErrorKind = 'connection' | 'general';

export interface RecoverFormError {
  /** `connection` muestra el botón "Reintentar". */
  kind: RecoverFormErrorKind;
  message: string;
}

export const RECOVER_MESSAGES = {
  /**
   * Aviso tras el 202 de `forgot`. Es un texto fijo del cliente (coincide con el del contrato)
   * y no el `message` del servidor, para que la respuesta visible sea siempre idéntica exista
   * o no la cuenta (RF-003-10, CA-003-09).
   */
  forgotSent: 'Si el correo está registrado, recibirás un enlace en unos minutos.',
  forgotSentHint:
    'Revisa también tu carpeta de spam. El enlace sirve una sola vez y vence en 30 minutos.',
  /** RF-003-12: el backend cierra las demás sesiones al cambiar la contraseña. */
  resetDone: 'Tu contraseña se cambió. Cerramos tus otras sesiones.',
  /** `410 RESET_TOKEN_INVALID` (CA-003-11, CA-003-12). */
  resetTokenInvalid: 'Este enlace venció o ya se usó. Pide uno nuevo.',
  rateLimitedNoTime: 'Ya pediste 3 enlaces en la última hora. Espera unos minutos para pedir otro.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  invalidField: REGISTER_ERROR_MESSAGES.invalidField,
  reviewForm: REGISTER_ERROR_MESSAGES.reviewForm,
  weakPassword: REGISTER_ERROR_MESSAGES.weakPassword,
} as const;

/**
 * Mensaje de `429 RATE_LIMITED` de `forgot` (RF-003-18, CA-003-13), con la espera en minutos si
 * llega `details.retryAfterSeconds`; si no llega, sin número.
 */
export function forgotRateLimitedMessage(details: ApiError['details']): string {
  const seconds = details?.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return RECOVER_MESSAGES.rateLimitedNoTime;
  }
  const minutes = Math.ceil(seconds / 60);
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return `Ya pediste 3 enlaces en la última hora. Espera ${minutes} ${unit} para pedir otro.`;
}

/** Primer código de texto de `details.fields[field]`, o `undefined`. */
function firstFieldCode(details: ApiError['details'], field: string): string | null | undefined {
  const fields = details?.fields;
  if (typeof fields !== 'object' || fields === null) return undefined;
  const codes = (fields as Record<string, unknown>)[field];
  if (!Array.isArray(codes) || codes.length === 0) return undefined;
  return codes.find((code): code is string => typeof code === 'string') ?? null;
}

const connectionError: RecoverFormError = {
  kind: 'connection',
  message: RECOVER_MESSAGES.connection,
};

/* ---------- POST /auth/password/forgot ---------- */

export interface ForgotPasswordErrorView {
  fieldErrors: ForgotPasswordFieldErrors;
  formError: RecoverFormError | null;
}

const FORGOT_FIELD_CODE_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: LOGIN_MESSAGES.emailInvalid,
};

/** Decide dónde y qué mostrar para un error al pedir el enlace. */
export function mapForgotPasswordError(error: ApiError): ForgotPasswordErrorView {
  if (isConnectionError(error)) return { fieldErrors: {}, formError: connectionError };

  switch (error.code) {
    case 'RATE_LIMITED':
      // Se muestra aunque el correo no exista: el contador es por correo escrito.
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: forgotRateLimitedMessage(error.details) },
      };
    case 'VALIDATION_ERROR': {
      const code = firstFieldCode(error.details, 'email');
      if (code === undefined) {
        return {
          fieldErrors: {},
          formError: { kind: 'general', message: RECOVER_MESSAGES.reviewForm },
        };
      }
      return {
        fieldErrors: {
          email: (code && FORGOT_FIELD_CODE_MESSAGES[code]) ?? RECOVER_MESSAGES.invalidField,
        },
        formError: null,
      };
    }
    default:
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: RECOVER_MESSAGES.unexpected },
      };
  }
}

/* ---------- POST /auth/password/reset ---------- */

export interface ResetPasswordErrorView {
  /** `410 RESET_TOKEN_INVALID`: la pantalla cambia el formulario por el aviso y "Pedir otro enlace". */
  invalidLink: boolean;
  fieldErrors: ResetPasswordFieldErrors;
  formError: RecoverFormError | null;
}

const RESET_FIELD_CODE_MESSAGES: Record<string, string> = {
  WEAK_PASSWORD: RECOVER_MESSAGES.weakPassword,
};

/**
 * Mensaje por omisión de cada campo cuando el código no es conocido. La única regla del
 * servidor sobre la confirmación es que coincida con la contraseña.
 */
const RESET_FIELD_FALLBACK: Record<ResetPasswordField, string> = {
  newPassword: RECOVER_MESSAGES.weakPassword,
  newPasswordConfirmation: REGISTER_MESSAGES.passwordMismatch,
};

function resetFieldErrors(details: ApiError['details']): ResetPasswordFieldErrors {
  const errors: ResetPasswordFieldErrors = {};
  for (const field of RESET_PASSWORD_FIELDS) {
    const code = firstFieldCode(details, field);
    if (code === undefined) continue;
    errors[field] = (code && RESET_FIELD_CODE_MESSAGES[code]) ?? RESET_FIELD_FALLBACK[field];
  }
  return errors;
}

/** Decide dónde y qué mostrar para un error al guardar la contraseña nueva. */
export function mapResetPasswordError(error: ApiError): ResetPasswordErrorView {
  if (isConnectionError(error)) {
    return { invalidLink: false, fieldErrors: {}, formError: connectionError };
  }

  switch (error.code) {
    case 'RESET_TOKEN_INVALID':
      // Vencido, usado o reemplazado por uno más nuevo (CA-003-11, CA-003-12).
      return { invalidLink: true, fieldErrors: {}, formError: null };
    case 'VALIDATION_ERROR': {
      const fieldErrors = resetFieldErrors(error.details);
      const hasFields = Object.keys(fieldErrors).length > 0;
      return {
        invalidLink: false,
        fieldErrors,
        formError: hasFields ? null : { kind: 'general', message: RECOVER_MESSAGES.reviewForm },
      };
    }
    default:
      return {
        invalidLink: false,
        fieldErrors: {},
        formError: { kind: 'general', message: RECOVER_MESSAGES.unexpected },
      };
  }
}
