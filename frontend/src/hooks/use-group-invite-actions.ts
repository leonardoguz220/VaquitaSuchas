'use client';

import { useCallback, useRef, useState } from 'react';
import { getGroup, regenerateInviteCode, updateGroup, type GroupDetail } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type InviteAction = 'regenerate' | 'accepting';

/** `stale`: hubo `409 STALE_STATE` y el grupo en pantalla ya se reemplazó por el recargado. */
export type InviteActionResult =
  { ok: true } | { ok: false; error: ApiError; stale: boolean } | null;

export interface UseGroupInviteActionsOptions {
  group: GroupDetail;
  /** Recibe el grupo actualizado que hay que mostrar. */
  onGroupChange: (group: GroupDetail) => void;
}

/**
 * Acciones del titular sobre el código y la recepción de miembros (T025):
 * `POST /groups/:id/invite-code/regenerate` (RF-001-08) y `PATCH /groups/:id { acceptingMembers,
 * version }` (RF-001-09). Ante `409 STALE_STATE` vuelve a pedir el grupo (plan 001 §6).
 * Devuelve `null` si ya había una acción en curso o llegó un `401`.
 */
export function useGroupInviteActions({ group, onGroupChange }: UseGroupInviteActionsOptions) {
  const [pending, setPending] = useState<InviteAction | null>(null);
  const inFlight = useRef(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const run = useCallback(
    async (
      action: InviteAction,
      request: () => Promise<GroupDetail>,
    ): Promise<InviteActionResult> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(action);
      try {
        onGroupChange(await request());
        return { ok: true };
      } catch (caught) {
        const error = toApiError(caught);
        if (redirectIfUnauthorized(error)) return null;
        const stale = error.statusCode === 409;
        if (stale) {
          try {
            onGroupChange(await getGroup(group.id));
          } catch {
            // Si la recarga falla, el aviso de conflicto basta: el siguiente intento vuelve a fallar con 409.
          }
        }
        return { ok: false, error, stale };
      } finally {
        inFlight.current = false;
        setPending(null);
      }
    },
    [group.id, onGroupChange, redirectIfUnauthorized],
  );

  const regenerate = useCallback(
    () =>
      run('regenerate', async () => {
        const { inviteCode } = await regenerateInviteCode(group.id);
        return { ...group, inviteCode };
      }),
    [group, run],
  );

  const setAcceptingMembers = useCallback(
    (acceptingMembers: boolean) =>
      run('accepting', () => updateGroup(group.id, { acceptingMembers, version: group.version })),
    [group, run],
  );

  return { regenerate, setAcceptingMembers, pending };
}
