'use client';

import { useCallback, useRef, useState } from 'react';
import { getGroup, removeMember, type GroupDetail } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type RemoveMemberResult =
  { ok: true; openCharges: number } | { ok: false; error: ApiError } | null;

/**
 * Quitar a un miembro (T029, RF-001-15): `DELETE /groups/:id/members/:userId` y, si sale bien, el
 * detalle del grupo de nuevo, porque cambian la lista de miembros y las cuotas. Devuelve `null` si
 * ya había un envío en curso o llegó un `401`.
 */
export function useRemoveMember(group: GroupDetail, onGroupChange: (group: GroupDetail) => void) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const remove = useCallback(
    async (userId: string): Promise<RemoveMemberResult> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      try {
        const { openCharges } = await removeMember(group.id, userId);
        try {
          onGroupChange(await getGroup(group.id));
        } catch {
          // Si la recarga falla, el grupo en pantalla queda como estaba; el siguiente cambio lo trae.
        }
        return { ok: true, openCharges };
      } catch (caught) {
        const error = toApiError(caught);
        if (redirectIfUnauthorized(error)) return null;
        if (error.statusCode === 404) {
          try {
            onGroupChange(await getGroup(group.id));
          } catch {
            // Sin recarga, el aviso de «ya no es miembro» basta.
          }
        }
        return { ok: false, error };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [group.id, onGroupChange, redirectIfUnauthorized],
  );

  return { remove, pending };
}
