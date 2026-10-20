/**
 * Validación de ayuda del formulario de registro (spec 003, RNF-003-04). Solo orienta a la
 * persona mientras escribe: la decisión es siempre del servidor (CLAUDE.md §2, regla 8), que
 * vuelve a validar todo y responde `VALIDATION_ERROR` con `details.fields`.
 * Los límites copian los del contrato `POST /auth/register` y RF-003-01 / RF-003-03.
 */

export interface RegisterFormValues {
  fullName: string;
  email: string;
  ci: string;
  password: string;
  passwordConfirmation: string;
  acceptDataPolicy: boolean;
}

export type RegisterField = keyof RegisterFormValues;

/** Orden de los campos en pantalla; decide a cuál va el foco tras un envío fallido. */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  'fullName',
  'email',
  'ci',
  'password',
  'passwordConfirmation',
  'acceptDataPolicy',
];

export type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export const EMPTY_REGISTER_VALUES: RegisterFormValues = {
  fullName: '',
  email: '',
  ci: '',
  password: '',
  passwordConfirmation: '',
  acceptDataPolicy: false,
};

export const REGISTER_MESSAGES = {
  fullNameRequired: 'Escribe tu nombre completo.',
  fullNameLength: 'El nombre debe tener entre 2 y 80 caracteres.',
  emailRequired: 'Escribe tu correo.',
  emailInvalid: 'Escribe un correo válido, por ejemplo ana@gmail.com.',
  ciRequired: 'Escribe el número de tu cédula de identidad.',
  ciInvalid: 'La cédula debe tener solo números, entre 5 y 10 dígitos.',
  passwordRules: 'La contraseña no cumple todas las reglas de la lista.',
  passwordMismatch: 'Las contraseñas no coinciden.',
  confirmationRequired: 'Vuelve a escribir la contraseña.',
  policyRequired: 'Debes aceptar la política de datos para crear tu cuenta.',
} as const;

export type PasswordRuleId = 'minLength' | 'letter' | 'number' | 'notEmail';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}

const PASSWORD_MIN_LENGTH = 10;
const FULL_NAME_MIN = 2;
const FULL_NAME_MAX = 80;
const CI_PATTERN = /^\d{5,10}$/;
// Solo forma básica; el servidor valida el correo de verdad (INVALID_EMAIL).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Estado de cada regla de contraseña de RF-003-03, para la lista en vivo.
 * Una contraseña vacía no cumple ninguna regla.
 *
 * Sin `email` (pantalla `/recuperar/[token]`, donde no se conoce el correo) se omite la regla
 * "Distinta de tu correo": no se puede evaluar y marcarla como cumplida sería engañoso. La
 * comprueba el servidor (`WEAK_PASSWORD`).
 */
export function evaluatePasswordRules(password: string, email?: string): PasswordRuleResult[] {
  const rules: PasswordRuleResult[] = [
    {
      id: 'minLength',
      label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: 'letter', label: 'Al menos una letra', met: /\p{L}/u.test(password) },
    { id: 'number', label: 'Al menos un número', met: /\d/.test(password) },
  ];
  if (email === undefined) return rules;
  const hasPassword = password.length > 0;
  const sameAsEmail = password.trim().toLowerCase() === email.trim().toLowerCase();
  return [
    ...rules,
    { id: 'notEmail', label: 'Distinta de tu correo', met: hasPassword && !sameAsEmail },
  ];
}

/** Errores de ayuda de cada campo; un objeto vacío significa que se puede enviar. */
export function validateRegisterForm(values: RegisterFormValues): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};

  const fullName = values.fullName.trim();
  if (fullName === '') errors.fullName = REGISTER_MESSAGES.fullNameRequired;
  else if (fullName.length < FULL_NAME_MIN || fullName.length > FULL_NAME_MAX) {
    errors.fullName = REGISTER_MESSAGES.fullNameLength;
  }

  const email = values.email.trim();
  if (email === '') errors.email = REGISTER_MESSAGES.emailRequired;
  else if (!EMAIL_PATTERN.test(email)) errors.email = REGISTER_MESSAGES.emailInvalid;

  const ci = values.ci.trim();
  if (ci === '') errors.ci = REGISTER_MESSAGES.ciRequired;
  else if (!CI_PATTERN.test(ci)) errors.ci = REGISTER_MESSAGES.ciInvalid;

  if (!evaluatePasswordRules(values.password, values.email).every((rule) => rule.met)) {
    errors.password = REGISTER_MESSAGES.passwordRules;
  }

  if (values.passwordConfirmation === '') {
    errors.passwordConfirmation = REGISTER_MESSAGES.confirmationRequired;
  } else if (values.passwordConfirmation !== values.password) {
    errors.passwordConfirmation = REGISTER_MESSAGES.passwordMismatch;
  }

  if (!values.acceptDataPolicy) errors.acceptDataPolicy = REGISTER_MESSAGES.policyRequired;

  return errors;
}

/** Primer campo con error según el orden de la pantalla. */
export function firstFieldWithError(errors: RegisterFieldErrors): RegisterField | undefined {
  return REGISTER_FIELDS.find((field) => errors[field] !== undefined);
}

/* ---------- Inicio de sesión (spec 003 T029) ---------- */

export interface LoginFormValues {
  email: string;
  password: string;
}

export type LoginField = keyof LoginFormValues;

/** Orden de los campos de `/ingresar`; decide a cuál va el foco tras un envío fallido. */
export const LOGIN_FIELDS: readonly LoginField[] = ['email', 'password'];

export type LoginFieldErrors = Partial<Record<LoginField, string>>;

export const EMPTY_LOGIN_VALUES: LoginFormValues = { email: '', password: '' };

export const LOGIN_MESSAGES = {
  emailRequired: REGISTER_MESSAGES.emailRequired,
  emailInvalid: REGISTER_MESSAGES.emailInvalid,
  passwordRequired: 'Escribe tu contraseña.',
} as const;

/**
 * Validación de ayuda de `/ingresar`: solo la forma del correo y que haya contraseña. No se
 * revisan las reglas de la contraseña (eso diría algo de la cuenta): el servidor decide.
 */
export function validateLoginForm(values: LoginFormValues): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const email = values.email.trim();
  if (email === '') errors.email = LOGIN_MESSAGES.emailRequired;
  else if (!EMAIL_PATTERN.test(email)) errors.email = LOGIN_MESSAGES.emailInvalid;
  if (values.password === '') errors.password = LOGIN_MESSAGES.passwordRequired;
  return errors;
}

/** Primer campo de `/ingresar` con error según el orden de la pantalla. */
export function firstLoginFieldWithError(errors: LoginFieldErrors): LoginField | undefined {
  return LOGIN_FIELDS.find((field) => errors[field] !== undefined);
}

/* ---------- Recuperación de contraseña (spec 003 T035) ---------- */

export interface ForgotPasswordFormValues {
  email: string;
}

export type ForgotPasswordFieldErrors = Partial<Record<keyof ForgotPasswordFormValues, string>>;

/** Validación de ayuda de `/recuperar`: solo la forma del correo (RNF-003-04). */
export function validateForgotPasswordForm(
  values: ForgotPasswordFormValues,
): ForgotPasswordFieldErrors {
  const email = values.email.trim();
  if (email === '') return { email: LOGIN_MESSAGES.emailRequired };
  if (!EMAIL_PATTERN.test(email)) return { email: LOGIN_MESSAGES.emailInvalid };
  return {};
}

export interface ResetPasswordFormValues {
  newPassword: string;
  newPasswordConfirmation: string;
}

export type ResetPasswordField = keyof ResetPasswordFormValues;

/** Orden de los campos de `/recuperar/[token]`; decide a cuál va el foco tras un error. */
export const RESET_PASSWORD_FIELDS: readonly ResetPasswordField[] = [
  'newPassword',
  'newPasswordConfirmation',
];

export type ResetPasswordFieldErrors = Partial<Record<ResetPasswordField, string>>;

export const EMPTY_RESET_PASSWORD_VALUES: ResetPasswordFormValues = {
  newPassword: '',
  newPasswordConfirmation: '',
};

/**
 * Validación de ayuda de `/recuperar/[token]` (RNF-003-04): las reglas evaluables sin conocer
 * el correo y que la confirmación coincida. La regla "distinta del correo" la decide el servidor.
 */
export function validateResetPasswordForm(
  values: ResetPasswordFormValues,
): ResetPasswordFieldErrors {
  const errors: ResetPasswordFieldErrors = {};
  if (!evaluatePasswordRules(values.newPassword).every((rule) => rule.met)) {
    errors.newPassword = REGISTER_MESSAGES.passwordRules;
  }
  if (values.newPasswordConfirmation === '') {
    errors.newPasswordConfirmation = REGISTER_MESSAGES.confirmationRequired;
  } else if (values.newPasswordConfirmation !== values.newPassword) {
    errors.newPasswordConfirmation = REGISTER_MESSAGES.passwordMismatch;
  }
  return errors;
}

/** Primer campo de `/recuperar/[token]` con error según el orden de la pantalla. */
export function firstResetPasswordFieldWithError(
  errors: ResetPasswordFieldErrors,
): ResetPasswordField | undefined {
  return RESET_PASSWORD_FIELDS.find((field) => errors[field] !== undefined);
}
