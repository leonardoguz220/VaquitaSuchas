/**
 * Cliente de los endpoints de usuarios del panel de administración (spec 009,
 * `contracts/api.md` § Usuarios). Una función por endpoint; todos exigen `AdminGuard` en el
 * servidor y responden `403` a quien no es administrador (CA-009-01). Los estados y los efectos
 * (sesiones, huellas, grupos) los decide el backend: el frontend solo muestra lo que llega.
 */
import type { ReputationLevel } from './reputation';
import { apiRequest } from './http';

export type AdminUserStatus = 'activo' | 'suspendido' | 'baneado';
export type AdminUserRole = 'usuario' | 'admin';

/**
 * Fila de la lista `GET /admin/users`. [NECESITA ACLARACIÓN] El contrato nombra `AdminUserRow`
 * sin detallar sus campos; se toman los de la ficha que muestra la lista (plan 009 §6 y mockup
 * `AdminUsuarios.dc.html`): nombre, correo, celular, rol, estado y alta.
 */
export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  /** `"+59171234567"`. */
  phone: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

export interface AdminUsersPage {
  items: AdminUserRow[];
  nextCursor: string | null;
}

/**
 * Baneo vigente de la ficha. [NECESITA ACLARACIÓN] El contrato solo muestra `"ban": null`; hace
 * falta al menos `id` para `POST /admin/bans/:banId/revoke`.
 */
export interface AdminUserBan {
  id: string;
  reason: string;
  /** ISO 8601 en UTC. */
  bannedAt: string;
}

/** Suspensión abierta de la ficha. [NECESITA ACLARACIÓN] El contrato solo muestra `null`. */
export interface AdminUserSuspension {
  reason: string;
  /** ISO 8601 en UTC. */
  suspendedAt: string;
}

/** Habilitación manual vigente. [NECESITA ACLARACIÓN] El contrato solo muestra `null`. */
export interface AdminUserHostEnablement {
  reason: string;
  /** ISO 8601 en UTC. */
  enabledAt: string;
}

/**
 * Ficha `GET /admin/users/:userId` (RF-009-09). Nunca incluye hash de contraseña, CI en claro
 * ni comprobantes (CA-009-08, CA-009-36).
 */
export interface AdminUserDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  /** `"*****123"`: solo los últimos dígitos (CA-009-36). */
  ciMasked: string;
  status: AdminUserStatus;
  role: AdminUserRole;
  createdAt: string;
  lastLoginAt: string | null;
  groupsAsHost: number;
  groupsAsMember: number;
  reputation: { level: ReputationLevel; stars: number | null; consideredCharges: number };
  reportsReceived: number;
  ban: AdminUserBan | null;
  suspension: AdminUserSuspension | null;
  hostEnablement: AdminUserHostEnablement | null;
}

/** Largo del motivo de toda acción de administración, tras recortar (RN-009-04, RN-009-07). */
export const ADMIN_REASON_MIN = 10;
export const ADMIN_REASON_MAX = 300;

export interface ListAdminUsersParams {
  /** Nombre o correo, sin tildes ni mayúsculas (CA-009-07). */
  q?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
  limit?: number;
  cursor?: string;
}

function userPath(userId: string): string {
  return `/api/admin/users/${encodeURIComponent(userId)}`;
}

/** `GET /admin/users` (RF-009-08, CA-009-07). Sin resultados: lista vacía. */
export function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersPage> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.role) query.set('role', params.role);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<AdminUsersPage>(`/api/admin/users${search ? `?${search}` : ''}`);
}

/** `GET /admin/users/:userId` (RF-009-09; CA-009-08, CA-009-36). */
export function getAdminUser(userId: string): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(userPath(userId));
}

/**
 * `POST /admin/users/:userId/suspend` (RF-009-10). Devuelve la ficha actualizada. Errores:
 * `400` (motivo), `422 BUSINESS_RULE` `RN-009-02` (administrador o uno mismo),
 * `409 INVALID_TRANSITION` (ya suspendido o baneado).
 */
export function suspendAdminUser(
  userId: string,
  input: { reason: string },
): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`${userPath(userId)}/suspend`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /admin/users/:userId/reactivate` (CA-009-11). Solo desde `suspendido`; un `baneado`
 * responde `422 USER_BANNED` (CA-009-24). [NECESITA ACLARACIÓN] El contrato no dice qué devuelve;
 * se asume la ficha actualizada, como al suspender.
 */
export function reactivateAdminUser(
  userId: string,
  input: { reason?: string },
): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`${userPath(userId)}/reactivate`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /admin/users/:userId/ban` (RF-009-19): `{ banId, user }`. Errores: `400`,
 * `422 BUSINESS_RULE` `RN-009-07` (a sí mismo o a un administrador), `409 INVALID_TRANSITION`.
 */
export function banAdminUser(
  userId: string,
  input: { reason: string; disputeId?: string },
): Promise<{ banId: string; user: AdminUserDetail }> {
  return apiRequest<{ banId: string; user: AdminUserDetail }>(`${userPath(userId)}/ban`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /admin/bans/:banId/revoke` (RF-009-23, CA-009-34): otro administrador, con motivo.
 * Errores: `422 SAME_ADMIN`, `409` (ya revertido). [NECESITA ACLARACIÓN] El contrato dice solo
 * «Response 200» sin cuerpo; la pantalla vuelve a pedir la ficha.
 */
export function revokeAdminBan(banId: string, input: { reason: string }): Promise<unknown> {
  return apiRequest<unknown>(`/api/admin/bans/${encodeURIComponent(banId)}/revoke`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /admin/users/:userId/role` (RF-009-03): promover o quitar el rol. Error
 * `422 LAST_ADMIN` (RN-009-01, CA-009-12). [NECESITA ACLARACIÓN] El contrato no dice qué
 * devuelve; la pantalla vuelve a pedir la ficha.
 */
export function changeAdminUserRole(
  userId: string,
  input: { role: AdminUserRole; reason: string },
): Promise<unknown> {
  return apiRequest<unknown>(`${userPath(userId)}/role`, { method: 'POST', body: input });
}
