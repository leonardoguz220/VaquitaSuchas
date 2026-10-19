/**
 * Textos y errores de `/perfil` (spec 003 T039), elegidos siempre por `code` y nunca por
 * `message` (contrato 000 A.2; contrato 003, sección Perfil y `POST /auth/password/change`).
 */
import { REGISTER_MESSAGES } from '@/lib/auth-validation';
import {
  CHANGE_PASSWORD_FIELDS,
  type ChangePasswordField,
  type ChangePasswordFieldErrors,
} from '@/lib/profile-validation';
import { isConnectionError, type ApiError } from '@/services/http';
import { REGISTER_ERROR_MESSAGES, rateLimitedMessage } from '../auth/register-errors';
import { REGISTER_VERIFY_MESSAGES } from '../auth/register-verify-messages';

export const PROFILE_MESSAGES = {
  nameSaved: 'Guardamos tu nombre.',
  /** CA-003-16: el backend cierra las demás sesiones y envía un correo de aviso. */
  passwordChanged: 'Cambiaste tu contraseña. Cerramos tus otras sesiones.',
  phoneUpdated: 'Tu celular quedó actualizado.',
  currentPasswordWrong: 'La contraseña actual no es correcta.',
  /** `400 FIELD_NOT_EDITABLE`: no debería pasar, porque la pantalla solo envía el nombre. */
  fieldNotEditable: 'Solo puedes cambiar tu nombre. Tu correo y tu cédula no se pueden editar.',
  /** Rechazo del cambio de celular sin un motivo que se pueda mostrar (incluye el bloqueo, RF-003-19). */
  phoneNotAllowed: 'No es posible usar ese celular.',
  loadFailed: 'No pudimos cargar tu perfil.',
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  weakPassword: REGISTER_ERROR_MESSAGES.weakPassword,
  reviewForm: REGISTER_ERROR_MESSAGES.reviewForm,
} as const;

export type ProfileFormErrorKind = 'connection' | 'general';

export interface ProfileFormError {
  /** `connection` muestra el botón "Reintentar". */
  kind: ProfileFormErrorKind;
  message: string;
}

const connectionError: ProfileFormError = {
  kind: 'connection',
  message: PROFILE_MESSAGES.connection,
};
const unexpectedError: ProfileFormError = { kind: 'general', message: PROFILE_MESSAGES.unexpected };

/** Primer código de texto de `details.fields[field]`; `undefined` si el campo no viene. */
function firstFieldCode(details: ApiError['details'], field: string): string | null | undefined {
  const fields = details?.fields;
  if (typeof fields !== 'object' || fields === null) return undefined;
  const codes = (fields as Record<string, unknown>)[field];
  if (!Array.isArray(codes) || codes.length === 0) return undefined;
  return codes.find((code): code is string => typeof code === 'string') ?? null;
}

/** Mensaje del aviso cuando `GET /auth/me` falla por algo que no es un `401`. */
export function profileLoadErrorMessage(error: ApiError): string {
  return isConnectionError(error) ? PROFILE_MESSAGES.connection : PROFILE_MESSAGES.unexpected;
}

/* ---------- PATCH /users/me ---------- */

export interface UpdateNameErrorView {
  fieldError: string | null;
  formError: ProfileFormError | null;
}

/** Decide dónde y qué mostrar para un error al guardar el nombre. */
export function mapUpdateNameError(error: ApiError): UpdateNameErrorView {
  if (isConnectionError(error)) return { fieldError: null, formError: connectionError };
  switch (error.code) {
    case 'VALIDATION_ERROR':
      // La única regla del servidor sobre el nombre es su largo (2 a 80).
      return firstFieldCode(error.details, 'fullName') === undefined
        ? { fieldError: null, formError: { kind: 'general', message: PROFILE_MESSAGES.reviewForm } }
        : { fieldError: REGISTER_MESSAGES.fullNameLength, formError: null };
    case 'FIELD_NOT_EDITABLE':
      return {
        fieldError: null,
        formError: { kind: 'general', message: PROFILE_MESSAGES.fieldNotEditable },
      };
    default:
      return { fieldError: null, formError: unexpectedError };
  }
}

/* ---------- POST /auth/password/change ---------- */

export interface ChangePasswordErrorView {
  fieldErrors: ChangePasswordFieldErrors;
  formError: ProfileFormError | null;
}

const PASSWORD_FIELD_CODE_MESSAGES: Record<string, string> = {
  WEAK_PASSWORD: PROFILE_MESSAGES.weakPassword,
};

/** Mensaje por omisión de cada campo cuando el código del servidor no es conocido. */
const PASSWORD_FIELD_FALLBACK: Record<ChangePasswordField, string> = {
  currentPassword: REGISTER_ERROR_MESSAGES.invalidField,
  newPassword: PROFILE_MESSAGES.weakPassword,
  newPasswordConfirmation: REGISTER_MESSAGES.passwordMismatch,
};

function passwordFieldErrors(details: ApiError['details']): ChangePasswordFieldErrors {
  const errors: ChangePasswordFieldErrors = {};
  for (const field of CHANGE_PASSWORD_FIELDS) {
    const code = firstFieldCode(details, field);
    if (code === undefined) continue;
    errors[field] = (code && PASSWORD_FIELD_CODE_MESSAGES[code]) ?? PASSWORD_FIELD_FALLBACK[field];
  }
  return errors;
}

/** Decide dónde y qué mostrar para un error al cambiar la contraseña. */
export function mapChangePasswordError(error: ApiError): ChangePasswordErrorView {
  if (isConnectionError(error)) return { fieldErrors: {}, formError: connectionError };
  switch (error.code) {
    case 'CURRENT_PASSWORD_WRONG':
      return {
        fieldErrors: { currentPassword: PROFILE_MESSAGES.currentPasswordWrong },
        formError: null,
      };
    case 'RATE_LIMITED':
      return {
        fieldErrors: {},
        formError: { kind: 'general', message: rateLimitedMessage(error.details) },
      };
    case 'VALIDATION_ERROR': {
      const fieldErrors = passwordFieldErrors(error.details);
      const hasFields = Object.keys(fieldErrors).length > 0;
      return {
        fieldErrors,
        formError: hasFields ? null : { kind: 'general', message: PROFILE_MESSAGES.reviewForm },
      };
    }
    default:
      return { fieldErrors: {}, formError: unexpectedError };
  }
}

/* ---------- Cambio de celular ---------- */

/**
 * Mismos mensajes que el registro para los motivos que se pueden explicar (CA-003-15: un número
 * que no es boliviano se rechaza). El bloqueo o un código desconocido dan un mensaje genérico
 * que no dice qué dato está bloqueado (RF-003-19); el del registro habla de "crear la cuenta",
 * que no corresponde aquí.
 */
const PHONE_REJECTED_MESSAGES: Record<string, string> = {
  PHONE_NOT_BOLIVIAN: REGISTER_VERIFY_MESSAGES.phoneNotBolivian,
  PHONE_ALREADY_REGISTERED: REGISTER_VERIFY_MESSAGES.phoneTaken,
  TELEGRAM_ALREADY_REGISTERED: REGISTER_VERIFY_MESSAGES.telegramTaken,
};

/** Mensaje de un `rejected` de `GET /users/me/phone-change/status`. */
export function phoneChangeRejectedMessage(code: string | null | undefined): string {
  return code && Object.hasOwn(PHONE_REJECTED_MESSAGES, code)
    ? PHONE_REJECTED_MESSAGES[code]
    : PROFILE_MESSAGES.phoneNotAllowed;
}
