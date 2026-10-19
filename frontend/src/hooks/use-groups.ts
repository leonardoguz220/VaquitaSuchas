'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listGroups, type GroupRole, type GroupSummary } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type GroupsState =
  | { status: 'loading' }
  | { status: 'success'; items: GroupSummary[] }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseGroupsResult {
  state: GroupsState;
  retry: () => void;
}

/**
 * `GET /groups` (RF-001-19): los grupos del usuario, filtrados por rol en el servidor
 * (`role` vacío = todos). La API ya entrega rol, cuota y estado de cada uno.
 */
export function useGroups(role: GroupRole | null = null): UseGroupsResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: GroupsState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = `${role ?? 'todos'}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    listGroups(role ? { role } : {}, { signal: controller.signal }).then(
      (page) => {
        if (!controller.signal.aborted) {
          setSettled({ key, state: { status: 'success', items: page.items } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        setSettled({
          key,
          state: redirectRef.current(error)
            ? { status: 'redirecting' }
            : { status: 'error', error },
        });
      },
    );
    return () => controller.abort();
  }, [role, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const state: GroupsState = settled?.key === key ? settled.state : { status: 'loading' };
  return { state, retry };
}
