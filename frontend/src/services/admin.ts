/**
 * Cliente de los endpoints de administración (spec 009, `contracts/api.md`). Una función por
 * endpoint y tipos del contrato. Todas las rutas exigen rol `admin` en el servidor (RNF-009-01).
 * Conectadas al backend: usuarios, suspensión, baneo, reversión del baneo y roles (T018). Las
 * habilitaciones, las estadísticas y la transferencia siguen con datos simulados de `admin.mock.ts`
 * hasta sus tareas. Las pantallas no calculan cifras ni estados: muestran lo que llega.
 */
import { apiRequest } from './http';
import * as mock from './admin.mock';
import type { Rating, RatingLevel } from './reputation';

/** Motivo obligatorio de las acciones sensibles: de 10 a 300 caracteres (RF-009-10, RF-009-19). */
export const ADMIN_REASON_MIN = 10;
export const ADMIN_REASON_MAX = 300;

export type AdminRole = 'usuario' | 'admin';
export type AdminUserStatus = 'activo' | 'suspendido' | 'baneado';

/** Fila de la lista de usuarios (`GET /admin/users`). */
export interface AdminUserRow {
  id: string;
  fullName: string;
  /** `"+59171234567"`. La lista del backend todavía no lo trae: la pantalla muestra «—». */
  phone?: string | null;
  role: AdminRole;
  status: AdminUserStatus;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

export interface AdminUsersPage {
  items: AdminUserRow[];
  nextCursor: string | null;
}

/** Filtros de `GET /admin/users` (RF-009-08). */
export interface ListAdminUsersParams {
  /** Nombre o correo, sin distinguir mayúsculas ni tildes. */
  q?: string;
  status?: AdminUserStatus;
  role?: AdminRole;
  limit?: number;
  cursor?: string;
}

export interface AdminUserReputation extends Rating {
  consideredCharges: number;
}

export interface AdminBanInfo {
  /** Id del baneo: lo usa `POST /admin/bans/:banId/revoke`. */
  id: string;
  reason: string;
  /** Id de quien baneó (el backend no envía el nombre). */
  by: string;
  at: string;
}

export interface AdminSuspensionInfo {
  reason: string;
  at: string;
}

export interface AdminHostEnablementInfo {
  reason: string;
  by: string;
  at: string;
}

/** Ficha de un usuario (`GET /admin/users/:userId`, RF-009-09). Nunca trae CI en claro. */
export interface AdminUserDetail extends AdminUserRow {
  phone: string | null;
  email: string;
  /** `"*****123"`: solo los últimos 3 dígitos. */
  ciMasked: string;
  lastLoginAt: string | null;
  groupsAsHost: number;
  groupsAsMember: number;
  reputation: AdminUserReputation;
  reportsReceived: number;
  ban: AdminBanInfo | null;
  suspension: AdminSuspensionInfo | null;
  hostEnablement: AdminHostEnablementInfo | null;
}

/** Habilitación manual vigente de un titular (`GET /admin/host-enablements?active=true`). */
export interface HostEnablementRow {
  userId: string;
  fullName: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
}

export type AdminChargeStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

/** Agregados del tablero (`GET /admin/stats`, RF-009-15 a RF-009-17). Sin datos de personas. */
export interface AdminStats {
  users: { total: number; newThisMonth: number; active30d: number };
  groups: { active: number; closed: number };
  charges: {
    /** `YYYY-MM`. */
    period: string;
    byStatus: Record<AdminChargeStatus, number>;
    /** Monto administrado en centavos. */
    managedCents: number;
  };
  /** Proporción de 0 a 1. */
  punctualityRate: number;
  topServices: { name: string; groups: number }[];
  listings: { active: number };
  joinRequestsThisMonth: number;
  disputesOpen: number;
}

/** Ficha tal como la envía `GET /admin/users/:userId` (`AdminUserView` del backend). */
interface ApiAdminUserView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  ciMasked: string;
  role: AdminRole;
  status: AdminUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  groupsAsHost: number;
  groupsAsMember: number;
  reputation: { level: string | null; stars: number | null; consideredCharges: number };
  reportsReceived: number;
  ban: {
    id: string;
    reason: string;
    source: string;
    disputeId: string | null;
    bannedBy: string;
    bannedAt: string;
  } | null;
  suspension: { reason: string; suspendedBy: string; suspendedAt: string } | null;
  hostEnablement: { reason: string; enabledBy: string; enabledAt: string } | null;
}

/**
 * Traduce la ficha del backend a la forma de la pantalla: solo renombra campos. Sin reputación el
 * backend manda `level: null`; la spec 007 llama «Nuevo» a esa situación (RF-007-02), igual que el
 * ranking.
 */
function toUserDetail(view: ApiAdminUserView): AdminUserDetail {
  const { ban, suspension, hostEnablement, reputation, ...rest } = view;
  return {
    ...rest,
    reputation: {
      level: (reputation.level ?? 'Nuevo') as RatingLevel,
      stars: reputation.stars,
      starsLabel: null,
      consideredCharges: reputation.consideredCharges,
    },
    ban: ban ? { id: ban.id, reason: ban.reason, by: ban.bannedBy, at: ban.bannedAt } : null,
    suspension: suspension ? { reason: suspension.reason, at: suspension.suspendedAt } : null,
    hostEnablement: hostEnablement
      ? {
          reason: hostEnablement.reason,
          by: hostEnablement.enabledBy,
          at: hostEnablement.enabledAt,
        }
      : null,
  };
}

/** `GET /admin/users` (RF-009-08, CA-009-07). */
export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersPage> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.role) query.set('role', params.role);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<AdminUsersPage>(`/api/admin/users${suffix}`);
}

/** `GET /admin/users/:userId` (RF-009-09, CA-009-08). */
export async function getAdminUser(userId: string): Promise<AdminUserDetail> {
  const view = await apiRequest<ApiAdminUserView>(usersPath(userId));
  return toUserDetail(view);
}

/** `POST /admin/users/:userId/suspend` (RF-009-10, CA-009-09). */
export async function suspendAdminUser(userId: string, reason: string): Promise<AdminUserDetail> {
  const view = await apiRequest<ApiAdminUserView>(usersPath(userId, '/suspend'), {
    method: 'POST',
    body: { reason },
  });
  return toUserDetail(view);
}

/** `POST /admin/users/:userId/reactivate` (CA-009-11). El motivo es opcional. */
export async function reactivateAdminUser(
  userId: string,
  reason?: string,
): Promise<AdminUserDetail> {
  const view = await apiRequest<ApiAdminUserView>(usersPath(userId, '/reactivate'), {
    method: 'POST',
    body: reason ? { reason } : {},
  });
  return toUserDetail(view);
}

/**
 * `POST /admin/users/:userId/ban` (RF-009-19, CA-009-22). El backend responde `{ banId, user }`;
 * la pantalla recibe la ficha nueva.
 */
export async function banAdminUser(userId: string, reason: string): Promise<AdminUserDetail> {
  const { user } = await apiRequest<{ banId: string; user: ApiAdminUserView }>(
    usersPath(userId, '/ban'),
    { method: 'POST', body: { reason } },
  );
  return toUserDetail(user);
}

/** `POST /admin/bans/:banId/revoke` (RF-009-23, CA-009-34). Lo hace otra persona administradora. */
export function revokeAdminBan(banId: string, reason: string): Promise<void> {
  return apiRequest<void>(`/api/admin/bans/${encodeURIComponent(banId)}/revoke`, {
    method: 'POST',
    body: { reason },
  });
}

/** `POST /admin/users/:userId/role` (RF-009-03, CA-009-12). */
export async function setAdminUserRole(
  userId: string,
  role: AdminRole,
  reason: string,
): Promise<AdminUserDetail> {
  const view = await apiRequest<ApiAdminUserView>(usersPath(userId, '/role'), {
    method: 'POST',
    body: { role, reason },
  });
  return toUserDetail(view);
}

function usersPath(userId: string, suffix = ''): string {
  return `/api/admin/users/${encodeURIComponent(userId)}${suffix}`;
}

/** `GET /admin/host-enablements?active=true` (RF-009-21, CA-009-28). */
export function listHostEnablements(): Promise<HostEnablementRow[]> {
  return mock.listHostEnablements();
}

/** `POST /admin/users/:userId/host-enablement` (RF-009-21, CA-009-28). */
export function grantHostEnablement(userId: string, reason: string): Promise<HostEnablementRow> {
  return mock.grantHostEnablement(userId, reason);
}

/** `POST /admin/users/:userId/host-enablement/revoke` (RF-009-21, CA-009-28). */
export function revokeHostEnablement(userId: string, reason: string): Promise<void> {
  return mock.revokeHostEnablement(userId, reason);
}

/** `GET /admin/stats` (RF-009-15 a RF-009-17, CA-009-16). */
export function getAdminStats(): Promise<AdminStats> {
  return mock.getStats();
}

/** `POST /admin/groups/:groupId/transfer-ownership` (RF-009-24, CA-009-35). */
export function transferGroupOwnership(
  groupId: string,
  toUserId: string,
  reason: string,
): Promise<void> {
  return mock.transferOwnership(groupId, toUserId, reason);
}
