'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGroup, type GroupDetail } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** `not_found`: la API respondió `404` porque el grupo no existe o no es del usuario (CA-001-10). */
export type GroupState =
  | { status: 'loading' }
  | { status: 'success'; group: GroupDetail }
  | { status: 'not_found' }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseGroupResult {
  state: GroupState;
  retry: () => void;
  /** Reemplaza el grupo en pantalla por el que devolvió la API tras un cambio, sin recargar. */
  update: (group: GroupDetail) => void;
}

/** `GET /groups/:groupId`: el detalle de un grupo al que pertenece el usuario. */
export function useGroup(groupId: string): UseGroupResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: GroupState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = `${groupId}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    getGroup(groupId, { signal: controller.signal }).then(
      (group) => {
        if (!controller.signal.aborted) setSettled({ key, state: { status: 'success', group } });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        let next: GroupState;
        if (redirectRef.current(error)) next = { status: 'redirecting' };
        else if (error.statusCode === 404) next = { status: 'not_found' };
        else next = { status: 'error', error };
        setSettled({ key, state: next });
      },
    );
    return () => controller.abort();
  }, [groupId, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const update = useCallback(
    (group: GroupDetail) => setSettled({ key, state: { status: 'success', group } }),
    [key],
  );
  const state: GroupState = settled?.key === key ? settled.state : { status: 'loading' };
  return { state, retry, update };
}
