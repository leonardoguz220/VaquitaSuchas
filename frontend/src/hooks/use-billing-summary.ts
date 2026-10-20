'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBillingSummary, type BillingSummary } from '@/services/charges';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type BillingSummaryState =
  /** `previous`: el último resumen cargado, para mantener el selector mientras llega otro. */
  | { status: 'loading'; previous: BillingSummary | null }
  | { status: 'success'; summary: BillingSummary }
  /** `404`: el grupo aún no tiene ciclo en ese período. */
  | { status: 'empty' }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseBillingSummaryResult {
  state: BillingSummaryState;
  retry: () => void;
}

/**
 * `GET /groups/:groupId/billing/summary` (RF-002-16, RF-002-18). Con `period` en `null` el
 * servidor responde el último ciclo; los montos y totales llegan ya calculados.
 */
export function useBillingSummary(groupId: string, period: string | null): UseBillingSummaryResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: BillingSummaryState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = `${groupId}|${period ?? 'ultimo'}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    getBillingSummary(groupId, period ?? undefined, { signal: controller.signal }).then(
      (summary) => {
        if (!controller.signal.aborted) {
          setSettled({ key, state: { status: 'success', summary } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        let state: BillingSummaryState;
        if (redirectRef.current(error)) state = { status: 'redirecting' };
        else if (error.statusCode === 404) state = { status: 'empty' };
        else state = { status: 'error', error };
        setSettled({ key, state });
      },
    );
    return () => controller.abort();
  }, [groupId, period, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const previous = settled?.state.status === 'success' ? settled.state.summary : null;
  const state: BillingSummaryState =
    settled?.key === key ? settled.state : { status: 'loading', previous };
  return { state, retry };
}
