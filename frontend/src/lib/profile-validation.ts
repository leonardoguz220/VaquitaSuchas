/**
 * Validación de ayuda de `/perfil` (spec 003 T039, RNF-003-04). Solo orienta mientras se escribe:
 * el servidor vuelve a validar todo (`PATCH /users/me`, `POST /auth/password/change`).
 */
import { REGISTER_MESSAGES, evaluatePasswordRules } from './auth-validation';

const FULL_NAME_MIN = 2;
const FULL_NAME_MAX = 80;

export const PROFILE_VALIDATION_MESSAGES = {
  currentPasswordRequired: 'Escribe tu contraseña actual.',
} as const;

/** Error de ayuda del nombre (2 a 80 caracteres, contrato `PATCH /users/me`), o `undefined`. */
export function validateFullName(value: string): string | undefined {
  const fullName = value.trim();
  if (fullName === '') return REGISTER_MESSAGES.fullNameRequired;
  if (fullName.length < FULL_NAME_MIN || fullName.length > FULL_NAME_MAX) {
    return REGISTER_MESSAGES.fullNameLength;
  }
  return undefined;
}

export interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

export type ChangePasswordField = keyof ChangePasswordFormValues;

/** Orden de los campos en pantalla; decide a cuál va el foco tras un envío fallido. */
export const CHANGE_PASSWORD_FIELDS: readonly ChangePasswordField[] = [
  'currentPassword',
  'newPassword',
  'newPasswordConfirmation',
];

export type ChangePasswordFieldErrors = Partial<Record<ChangePasswordField, string>>;

export const EMPTY_CHANGE_PASSWORD_VALUES: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  newPasswordConfirmation: '',
};

/**
 * Validación de ayuda de "Cambiar contraseña" (RF-003-15): la actual no puede estar vacía, la
 * nueva cumple las reglas de RF-003-03 (incluida "distinta de tu correo", porque aquí se conoce
 * el correo) y la confirmación coincide. Si la actual es correcta lo decide el servidor.
 */
export function validateChangePasswordForm(
  values: ChangePasswordFormValues,
  email: string,
): ChangePasswordFieldErrors {
  const errors: ChangePasswordFieldErrors = {};
  if (values.currentPassword === '') {
    errors.currentPassword = PROFILE_VALIDATION_MESSAGES.currentPasswordRequired;
  }
  if (!evaluatePasswordRules(values.newPassword, email).every((rule) => rule.met)) {
    errors.newPassword = REGISTER_MESSAGES.passwordRules;
  }
  if (values.newPasswordConfirmation === '') {
    errors.newPasswordConfirmation = REGISTER_MESSAGES.confirmationRequired;
  } else if (values.newPasswordConfirmation !== values.newPassword) {
    errors.newPasswordConfirmation = REGISTER_MESSAGES.passwordMismatch;
  }
  return errors;
}

/** Primer campo con error según el orden de la pantalla. */
export function firstChangePasswordFieldWithError(
  errors: ChangePasswordFieldErrors,
): ChangePasswordField | undefined {
  return CHANGE_PASSWORD_FIELDS.find((field) => errors[field] !== undefined);
}
