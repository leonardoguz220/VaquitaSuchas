'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGroupCharges, type Charge, type ChargePublic } from '@/services/charges';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export const GROUP_CHARGES_PAGE_SIZE = 5;

export type GroupChargeItem = ChargePublic | Charge;

export type GroupChargesState =
  | { status: 'loading' }
  | {
      status: 'success';
      items: GroupChargeItem[];
      nextCursor: string | null;
      loadingMore: boolean;
      /** Error de «Cargar más»; los ítems ya cargados se conservan. */
      moreError: ApiError | null;
    }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseGroupChargesResult {
  state: GroupChargesState;
  retry: () => void;
  loadMore: () => void;
}

/**
 * `GET /groups/:groupId/charges` (RF-002-17): historial del grupo por páginas, en el orden del
 * servidor. «Cargar más» pide la página siguiente con `nextCursor` y la agrega al final.
 */
export function useGroupCharges(groupId: string): UseGroupChargesResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: GroupChargesState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const moreRef = useRef<AbortController | null>(null);
  const key = `${groupId}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  const failure = useCallback((caught: unknown): GroupChargesState => {
    const error = toApiError(caught);
    return redirectRef.current(error) ? { status: 'redirecting' } : { status: 'error', error };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getGroupCharges(
      groupId,
      { limit: GROUP_CHARGES_PAGE_SIZE },
      { signal: controller.signal },
    ).then(
      (page) => {
        if (controller.signal.aborted) return;
        setSettled({
          key,
          state: {
            status: 'success',
            items: page.items,
            nextCursor: page.nextCursor,
            loadingMore: false,
            moreError: null,
          },
        });
      },
      (caught: unknown) => {
        if (!controller.signal.aborted) setSettled({ key, state: failure(caught) });
      },
    );
    return () => {
      controller.abort();
      moreRef.current?.abort();
    };
  }, [groupId, key, failure]);

  const current = settled?.key === key ? settled.state : null;

  const loadMore = useCallback(() => {
    if (current?.status !== 'success' || !current.nextCursor || current.loadingMore) return;
    const base = current;
    const cursor = current.nextCursor;
    const controller = new AbortController();
    moreRef.current = controller;
    setSettled({ key, state: { ...base, loadingMore: true, moreError: null } });
    getGroupCharges(
      groupId,
      { limit: GROUP_CHARGES_PAGE_SIZE, cursor },
      { signal: controller.signal },
    ).then(
      (page) => {
        if (controller.signal.aborted) return;
        setSettled({
          key,
          state: {
            ...base,
            items: [...base.items, ...page.items],
            nextCursor: page.nextCursor,
            loadingMore: false,
            moreError: null,
          },
        });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        setSettled({
          key,
          state: redirectRef.current(error)
            ? { status: 'redirecting' }
            : { ...base, loadingMore: false, moreError: error },
        });
      },
    );
  }, [current, groupId, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state: current ?? { status: 'loading' }, retry, loadMore };
}
