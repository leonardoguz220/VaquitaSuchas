/**
 * Cliente de los endpoints de administración (spec 009, `contracts/api.md`). Una función por
 * endpoint y tipos del contrato. Todas las rutas exigen rol `admin` en el servidor (RNF-009-01).
 * Por ahora las funciones responden con datos simulados de `admin.mock.ts`; al conectar el
 * backend (T018 y T021) solo cambia el cuerpo por `apiRequest`. Las pantallas no calculan cifras
 * ni estados: muestran lo que llega.
 */
import * as mock from './admin.mock';
import type { Rating } from './reputation';

/** Motivo obligatorio de las acciones sensibles: de 10 a 300 caracteres (RF-009-10, RF-009-19). */
export const ADMIN_REASON_MIN = 10;
export const ADMIN_REASON_MAX = 300;

export type AdminRole = 'usuario' | 'admin';
export type AdminUserStatus = 'activo' | 'suspendido' | 'baneado';

/** Fila de la lista de usuarios (`GET /admin/users`). */
export interface AdminUserRow {
  id: string;
  fullName: string;
  /** `"+59171234567"`. */
  phone: string;
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
  reason: string;
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

/** `GET /admin/users` (RF-009-08, CA-009-07). */
export function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersPage> {
  return mock.listUsers(params);
}

/** `GET /admin/users/:userId` (RF-009-09, CA-009-08). */
export function getAdminUser(userId: string): Promise<AdminUserDetail> {
  return mock.getUser(userId);
}

/** `POST /admin/users/:userId/suspend` (RF-009-10, CA-009-09). */
export function suspendAdminUser(userId: string, reason: string): Promise<AdminUserDetail> {
  return mock.suspend(userId, reason);
}

/** `POST /admin/users/:userId/reactivate` (CA-009-11). El motivo es opcional. */
export function reactivateAdminUser(userId: string, reason?: string): Promise<AdminUserDetail> {
  return mock.reactivate(userId, reason);
}

/** `POST /admin/users/:userId/ban` (RF-009-19, CA-009-22). */
export function banAdminUser(userId: string, reason: string): Promise<AdminUserDetail> {
  return mock.ban(userId, reason);
}

/** `POST /admin/users/:userId/role` (RF-009-03, CA-009-12). */
export function setAdminUserRole(
  userId: string,
  role: AdminRole,
  reason: string,
): Promise<AdminUserDetail> {
  return mock.changeRole(userId, role, reason);
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
