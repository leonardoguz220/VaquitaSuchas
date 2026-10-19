'use client';

import { useCallback } from 'react';
import { listAdminUsers, type AdminRole, type AdminUserStatus } from '@/services/admin';
import { usePaginatedResource } from './use-paginated-resource';

/** Usuarios por página en la lista de administración (contrato 009: `limit` de 1 a 50). */
export const ADMIN_USERS_PAGE_SIZE = 20;

/** Filtros de la lista; `null` significa sin filtro. */
export interface AdminUserFilters {
  q: string;
  status: AdminUserStatus | null;
  role: AdminRole | null;
}

/**
 * Lista de usuarios (`GET /admin/users`, RF-009-08). Cada cambio de filtro vuelve a la primera
 * página; «Cargar más» sigue el `nextCursor` de la API.
 */
export function useAdminUsers(filters: AdminUserFilters) {
  const { q, status, role } = filters;
  const loadPage = useCallback(
    (cursor?: string) =>
      listAdminUsers({
        q: q.trim() || undefined,
        status: status ?? undefined,
        role: role ?? undefined,
        limit: ADMIN_USERS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [q, status, role],
  );
  return usePaginatedResource(loadPage);
}
