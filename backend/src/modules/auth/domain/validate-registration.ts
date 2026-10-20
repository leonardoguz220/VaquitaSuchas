import { normalizeCi } from './ci.js';
import { validatePassword } from './password-policy.js';
import type { RegistrationFieldErrors, RegistrationInput } from './registration.js';

// Reúne todos los errores de campo del registro (RF-003-02, 03, 22); vacío = datos válidos.
export function validateRegistration(input: RegistrationInput): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = { fields: {}, rules: [] };
  const nameLength = input.fullName.trim().length;
  if (nameLength < 2 || nameLength > 80) errors.fields.fullName = ['INVALID_NAME'];
  if (normalizeCi(input.ci) === null) errors.fields.ci = ['INVALID_CI'];
  const broken = validatePassword(input.password, input.email);
  if (broken.length > 0) {
    errors.fields.password = ['WEAK_PASSWORD'];
    errors.rules = broken;
  }
  if (input.password !== input.passwordConfirmation) {
    errors.fields.passwordConfirmation = ['PASSWORD_MISMATCH'];
  }
  return errors;
}
