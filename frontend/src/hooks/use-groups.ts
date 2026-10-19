'use client';

import { useCallback } from 'react';
import {
  getGroup,
  listGroups,
  regenerateInviteCode,
  updateGroup,
  type GroupRole,
  type UpdateGroupRequest,
} from '@/services/groups';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
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

/** Regenerar el código de invitación (`POST /groups/:id/invite-code/regenerate`, RF-001-08). */
export function useRegenerateInviteCode(groupId: string) {
  const request = useCallback(() => regenerateInviteCode(groupId), [groupId]);
  return useApiSubmit<void, { inviteCode: string }>(request);
}

/** Editar el grupo como titular (`PATCH /groups/:id`), por ejemplo pausar la recepción (RF-001-09). */
export function useUpdateGroup(groupId: string) {
  const request = useCallback(
    (input: UpdateGroupRequest) => updateGroup(groupId, input),
    [groupId],
  );
  return useApiSubmit(request);
}
