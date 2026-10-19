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

/** `UserSelf` del contrato 003: lo que ve la propia persona. */
export interface UserSelf {
  id: string;
  fullName: string;
  email: string;
  /** Solo los últimos 3 dígitos, por ejemplo "*****123". */
  ciMasked: string;
  /** "+59171234567". */
  phone: string;
  role: 'usuario' | 'admin';
  status: 'activo';
  lastLoginAt: string | null;
  createdAt: string;
}

/** Códigos de `rejected` en `GET /auth/register/status`. */
export type RegisterRejectedCode =
  | 'REGISTRATION_NOT_ALLOWED'
  | 'PHONE_NOT_BOLIVIAN'
  | 'PHONE_ALREADY_REGISTERED'
  | 'TELEGRAM_ALREADY_REGISTERED';

/**
 * Respuesta 200 de `GET /auth/register/status` tal como llega al navegador. En `verified` el
 * proxy ya guardó `sessionToken` en la cookie `vq_session` y lo quitó del cuerpo (contrato 000 C).
 */
export type RegisterStatusResponse =
  | { status: 'pending'; expiresAt: string }
  | { status: 'expired' }
  | { status: 'rejected'; code: RegisterRejectedCode }
  | { status: 'verified'; user: UserSelf };

/**
 * `GET /auth/register/status` (RF-003-21). El proxy agrega `X-Registration-Secret` desde la
 * cookie `vq_reg`. Lanza `ApiError` `401` si no hay registro activo.
 */
export function getRegisterStatus(): Promise<RegisterStatusResponse> {
  return apiRequest<RegisterStatusResponse>('/api/auth/register/status');
}

/** Respuesta 200 de `POST /auth/register/link`. */
export interface RegisterLinkResponse {
  verification: RegisterVerification;
}

/** Códigos de error propios de `POST /auth/register/link`. */
export type RegisterLinkErrorCode = 'RATE_LIMITED' | 'UNAUTHENTICATED' | 'ALREADY_VERIFIED';

/**
 * `POST /auth/register/link` (RF-003-21): pide un enlace nuevo; los anteriores dejan de servir.
 * Lanza `ApiError` `429 RATE_LIMITED`, `401` o `409 ALREADY_VERIFIED`.
 */
export function requestRegisterLink(): Promise<RegisterLinkResponse> {
  return apiRequest<RegisterLinkResponse>('/api/auth/register/link', { method: 'POST' });
}
