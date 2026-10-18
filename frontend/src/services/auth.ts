/**
 * Cliente de los endpoints de autenticación (spec 003, `contracts/api.md`).
 * Una función por endpoint; los tipos salen del contrato congelado.
 */
import { apiRequest } from './http';

/** Cuerpo de `POST /auth/register`. */
export interface RegisterRequest {
  fullName: string;
  email: string;
  /** Solo dígitos, de 5 a 10. */
  ci: string;
  password: string;
  passwordConfirmation: string;
  acceptDataPolicy: true;
}

/** Enlace al bot de Telegram con el token de un solo uso (RF-003-21). */
export interface RegisterVerification {
  telegramUrl: string;
  /** ISO 8601 en UTC. */
  expiresAt: string;
}

/**
 * Respuesta 201 de `POST /auth/register` tal como llega al navegador: el proxy guarda
 * `registrationSecret` en la cookie `vq_reg` y lo quita del cuerpo (contrato 000 C).
 */
export interface RegisterResponse {
  verification: RegisterVerification;
}

/** Códigos de error propios de `POST /auth/register`. */
export type RegisterErrorCode =
  'VALIDATION_ERROR' | 'EMAIL_TAKEN' | 'CI_TAKEN' | 'REGISTRATION_NOT_ALLOWED' | 'RATE_LIMITED';

/** `POST /auth/register` (RF-003-01). Lanza `ApiError` con los códigos del contrato. */
export function register(input: RegisterRequest): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/api/auth/register', { method: 'POST', body: input });
}

/**
 * Lo que ve la propia persona (contrato 003, objeto `UserSelf`). Nunca incluye el hash, la
 * CI en claro ni datos de otros.
 */
export interface UserSelf {
  id: string;
  fullName: string;
  email: string;
  /** `"*****123"`: solo los últimos 3 dígitos (CA-003-31). */
  ciMasked: string;
  /** `"+59171234567"`. */
  phone: string;
  role: 'usuario' | 'admin';
  /** Un usuario no activo no llega a ver este objeto. */
  status: 'activo';
  /** ISO 8601 en UTC (RF-003-09). */
  lastLoginAt: string | null;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

/** Cuerpo de `POST /auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Respuesta 200 de `POST /auth/login` tal como llega al navegador: el proxy guarda
 * `sessionToken` en la cookie httpOnly `vq_session` y lo quita del cuerpo (contrato 000 C).
 */
export interface LoginResponse {
  user: UserSelf;
}

/** Códigos de error propios de `POST /auth/login`. */
export type LoginErrorCode = 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS' | 'RATE_LIMITED';

/** `POST /auth/login` (RF-003-06). Lanza `ApiError` con los códigos del contrato. */
export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', body: input });
}

/** `GET /auth/me` (RF-003-08). Sin sesión válida lanza `ApiError` con `statusCode` 401. */
export function getMe(): Promise<UserSelf> {
  return apiRequest<UserSelf>('/api/auth/me');
}

/** Cuerpo de `POST /auth/password/forgot`. */
export interface ForgotPasswordRequest {
  email: string;
}

/**
 * Respuesta 202 de `POST /auth/password/forgot`: idéntica exista o no la cuenta (CA-003-09).
 * La pantalla no muestra `message` tal cual, sino su propio texto fijo (RF-003-10).
 */
export interface ForgotPasswordResponse {
  message: string;
}

/** Códigos de error propios de `POST /auth/password/forgot`. */
export type ForgotPasswordErrorCode = 'VALIDATION_ERROR' | 'RATE_LIMITED';

/** `POST /auth/password/forgot` (RF-003-10, RF-003-18). Lanza `ApiError` con los códigos del contrato. */
export function forgotPassword(input: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return apiRequest<ForgotPasswordResponse>('/api/auth/password/forgot', {
    method: 'POST',
    body: input,
  });
}

/** Cuerpo de `POST /auth/password/reset`; `token` sale del enlace del correo. */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

/** Códigos de error propios de `POST /auth/password/reset`. */
export type ResetPasswordErrorCode = 'VALIDATION_ERROR' | 'RESET_TOKEN_INVALID';

/**
 * `POST /auth/password/reset` (RF-003-12). Responde 204 sin cuerpo. Lanza `ApiError`:
 * `410 RESET_TOKEN_INVALID` (vencido, usado o reemplazado) o `400 VALIDATION_ERROR`.
 */
export async function resetPassword(input: ResetPasswordRequest): Promise<void> {
  await apiRequest<void>('/api/auth/password/reset', { method: 'POST', body: input });
}
