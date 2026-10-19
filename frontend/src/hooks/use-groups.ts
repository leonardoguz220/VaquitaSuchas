'use client';

import { useCallback } from 'react';
import { getGroup, listGroups, type GroupRole } from '@/services/groups';
import { useApiResource } from './use-api-resource';
import { usePaginatedResource } from './use-paginated-resource';

/** Grupos por página de "Mis suscripciones" (contrato 000 A: `limit` de 1 a 100). */
export const GROUPS_PAGE_SIZE = 50;

/**
 * "Mis suscripciones" (`GET /groups`, RF-001-19), con filtro por rol hecho por la API y "Ver
 * más" por cursor. Solo trae los grupos de la persona con sesión (CA-001-20).
 */
export function useGroups(role: GroupRole | null = null) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listGroups({
        ...(role ? { role } : {}),
        limit: GROUPS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [role],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Detalle de un grupo (`GET /groups/:id`). Un `404 NOT_FOUND` (no existe o no es miembro,
 * RNF-001-01) llega en `error`.
 */
export function useGroup(groupId: string) {
  const load = useCallback(() => getGroup(groupId), [groupId]);
  return useApiResource(load);
}
