'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createOwnerListing,
  getOwnerListing,
  renewOwnerListing,
  retireOwnerListing,
  updateOwnerListing,
  type ListingFormInput,
  type OwnerListing,
} from '@/services/group-listing';
import { toApiError, type ApiError } from '@/services/http';

export type OwnerListingState =
  | { status: 'loading' }
  | { status: 'ready'; listing: OwnerListing | null }
  | { status: 'error'; error: ApiError };

export type OwnerListingResult = { ok: true } | { ok: false; error: ApiError };

/**
 * Publicación del titular de un grupo (T011, spec 008): carga, guardar (alta o edición con la
 * `version` en pantalla), renovar y retirar. Ante `409 STALE_STATE` vuelve a pedir la publicación.
 * Igual que `useGroup`, el estado guarda la clave de la petición y lo pendiente se deriva al render.
 */
export function useOwnerListing(groupId: string) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: OwnerListingState } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${groupId}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    getOwnerListing(groupId, { signal: controller.signal }).then(
      (listing) => {
        if (!controller.signal.aborted) {
          setSettled({ key, state: { status: 'ready', listing } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ key, state: { status: 'error', error: toApiError(caught) } });
      },
    );
    return () => controller.abort();
  }, [groupId, key]);

  const state = useMemo<OwnerListingState>(
    () => (settled?.key === key ? settled.state : { status: 'loading' }),
    [settled, key],
  );

  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  const run = useCallback(
    async (action: () => Promise<OwnerListing | void>): Promise<OwnerListingResult> => {
      setBusy(true);
      try {
        const listing = await action();
        if (listing) setSettled({ key, state: { status: 'ready', listing } });
        else reload();
        return { ok: true };
      } catch (error) {
        const apiError = toApiError(error);
        if (apiError.code === 'STALE_STATE') reload();
        return { ok: false, error: apiError };
      } finally {
        setBusy(false);
      }
    },
    [key, reload],
  );

  /** Alta si no hay publicación abierta; edición con la versión en pantalla si la hay. */
  const save = useCallback(
    (input: ListingFormInput) => {
      const current = state.status === 'ready' ? state.listing : null;
      return run(() =>
        current
          ? updateOwnerListing(groupId, { ...input, version: current.version })
          : createOwnerListing(groupId, input),
      );
    },
    [groupId, run, state],
  );

  const renew = useCallback(() => run(() => renewOwnerListing(groupId)), [groupId, run]);

  const retire = useCallback(
    () =>
      run(async () => {
        await retireOwnerListing(groupId);
      }),
    [groupId, run],
  );

  return { state, busy, save, renew, retire, reload };
}
