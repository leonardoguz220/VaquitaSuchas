'use client';

import { useCallback, useRef, useState } from 'react';
import {
  getGroup,
  updateGroup,
  type GroupDetail,
  type UpdateGroupRequest,
} from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** `stale`: hubo `409 STALE_STATE` y el grupo en pantalla ya se reemplazó por el recargado. */
export type UpdateGroupResult =
  { ok: true } | { ok: false; error: ApiError; stale: boolean } | null;

/**
 * Edición del titular (T034, RF-001-14): `PATCH /groups/:id` con la `version` que se vio. Ante
 * `409 STALE_STATE` vuelve a pedir el grupo y lo devuelve con `stale: true`. Devuelve `null` si
 * ya había un envío en curso o llegó un `401`.
 */
export function useUpdateGroup(group: GroupDetail, onGroupChange: (group: GroupDetail) => void) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const save = useCallback(
    async (input: UpdateGroupRequest): Promise<UpdateGroupResult> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      try {
        onGroupChange(await updateGroup(group.id, { ...input, version: group.version }));
        return { ok: true };
      } catch (caught) {
        const error = toApiError(caught);
        if (redirectIfUnauthorized(error)) return null;
        const stale = error.statusCode === 409;
        if (stale) {
          try {
            onGroupChange(await getGroup(group.id));
          } catch {
            // Si la recarga falla, el aviso de conflicto basta.
          }
        }
        return { ok: false, error, stale };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [group.id, group.version, onGroupChange, redirectIfUnauthorized],
  );

  return { save, pending };
}
