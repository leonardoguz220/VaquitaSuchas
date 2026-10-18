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
