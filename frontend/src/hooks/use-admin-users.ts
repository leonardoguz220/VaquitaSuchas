'use client';

import { useCallback } from 'react';
import {
  banAdminUser,
  changeAdminUserRole,
  getAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  revokeAdminBan,
  suspendAdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/services/admin-users';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Usuarios por página de `/admin/usuarios`. */
export const ADMIN_USERS_PAGE_SIZE = 20;

export interface AdminUserFilters {
  q?: string;
  status?: AdminUserStatus;
  role?: AdminUserRole;
}

/** Búsqueda de usuarios (`GET /admin/users`, RF-009-08) con «Cargar más» por cursor. */
export function useAdminUsers({ q, status, role }: AdminUserFilters) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listAdminUsers({
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(role ? { role } : {}),
        limit: ADMIN_USERS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [q, status, role],
  );
  return usePaginatedResource(loadPage);
}

/** Ficha de un usuario (`GET /admin/users/:userId`, RF-009-09). `403` y `404` llegan en `error`. */
export function useAdminUser(userId: string) {
  const load = useCallback(() => getAdminUser(userId), [userId]);
  return useApiResource(load);
}

/** Acción con motivo sobre un usuario o su baneo. */
export type AdminUserAction =
  | { kind: 'suspend'; reason: string }
  | { kind: 'reactivate'; reason?: string }
  | { kind: 'ban'; reason: string }
  | { kind: 'revokeBan'; banId: string; reason: string }
  | { kind: 'role'; role: AdminUserRole; reason: string };

/**
 * Envía una acción de la ficha (suspender, reactivar, banear, revertir el baneo, cambiar el rol;
 * contrato 009 § Usuarios). La respuesta no se usa: la pantalla vuelve a pedir la ficha.
 */
export function useAdminUserAction(userId: string) {
  const request = useCallback(
    async (action: AdminUserAction): Promise<void> => {
      switch (action.kind) {
        case 'suspend':
          await suspendAdminUser(userId, { reason: action.reason });
          return;
        case 'reactivate':
          await reactivateAdminUser(userId, action.reason ? { reason: action.reason } : {});
          return;
        case 'ban':
          await banAdminUser(userId, { reason: action.reason });
          return;
        case 'revokeBan':
          await revokeAdminBan(action.banId, { reason: action.reason });
          return;
        case 'role':
          await changeAdminUserRole(userId, { role: action.role, reason: action.reason });
          return;
      }
    },
    [userId],
  );
  return useApiSubmit(request);
}
