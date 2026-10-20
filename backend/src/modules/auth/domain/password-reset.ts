import { validatePassword } from './password-policy.js';

export const RESET_TOKEN_TTL_MS = 30 * 60_000;
export const RESET_REQUEST_LIMIT = 3;
export const RESET_WINDOW_MS = 60 * 60_000;
export const MAX_MAIL_ATTEMPTS = 3;

export function resetTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

export interface NewPasswordErrors {
  fields: Partial<Record<'newPassword' | 'newPasswordConfirmation', string[]>>;
  rules: string[];
}

// Política de la contraseña nueva y confirmación (RF-003-03); vacío = válida.
export function validateNewPassword(
  newPassword: string,
  confirmation: string,
  email: string,
): NewPasswordErrors {
  const errors: NewPasswordErrors = { fields: {}, rules: [] };
  const broken = validatePassword(newPassword, email);
  if (broken.length > 0) {
    errors.fields.newPassword = ['WEAK_PASSWORD'];
    errors.rules = broken;
  }
  if (newPassword !== confirmation) errors.fields.newPasswordConfirmation = ['PASSWORD_MISMATCH'];
  return errors;
}
