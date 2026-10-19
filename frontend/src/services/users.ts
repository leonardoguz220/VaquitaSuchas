/**
 * Cliente de los endpoints del perfil (spec 003, `contracts/api.md`, sección Perfil).
 * Una función por endpoint; los tipos salen del contrato congelado.
 */
import type { RegisterVerification, UserSelf } from './auth';
import { apiRequest } from './http';

/** Cuerpo de `PATCH /users/me`: solo el nombre (2 a 80). El correo y la CI no se editan. */
export interface UpdateMeRequest {
  fullName: string;
}

/** Códigos de error propios de `PATCH /users/me`. */
export type UpdateMeErrorCode = 'VALIDATION_ERROR' | 'FIELD_NOT_EDITABLE';

/** `PATCH /users/me` (RF-003-14). Devuelve el `UserSelf` actualizado. */
export function updateMe(input: UpdateMeRequest): Promise<UserSelf> {
  return apiRequest<UserSelf>('/api/users/me', { method: 'PATCH', body: input });
}

/** Respuesta 201 de `POST /users/me/phone-change`: el mismo enlace al bot que el registro. */
export interface PhoneChangeResponse {
  verification: RegisterVerification;
}

/**
 * `POST /users/me/phone-change` (RF-003-14). Crea un enlace al bot para verificar el número
 * nuevo; hasta que el bot lo confirme se conserva el celular anterior (CA-003-32). Lanza
 * `ApiError` `429 RATE_LIMITED` (límite compartido de 5 enlaces por hora).
 */
export function startPhoneChange(): Promise<PhoneChangeResponse> {
  return apiRequest<PhoneChangeResponse>('/api/users/me/phone-change', { method: 'POST' });
}

/**
 * Respuesta 200 de `GET /users/me/phone-change/status`, tal como la define el contrato:
 * `code` acompaña a `rejected` y `user` a `verified`.
 */
export interface PhoneChangeStatusResponse {
  status: 'pending' | 'expired' | 'rejected' | 'verified';
  code?: string;
  user?: UserSelf;
}

/** `GET /users/me/phone-change/status` (RF-003-14): se consulta cada 2 s mientras espera. */
export function getPhoneChangeStatus(): Promise<PhoneChangeStatusResponse> {
  return apiRequest<PhoneChangeStatusResponse>('/api/users/me/phone-change/status');
}
