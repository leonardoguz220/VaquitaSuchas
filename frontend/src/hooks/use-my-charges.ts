'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listMyCharges, type ChargeStatus, type MyCharge } from '@/services/charges';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export interface MyChargesFilters {
  status: ChargeStatus | null;
  /** `YYYY-MM`; `null` = todos los períodos. */
  period: string | null;
}

export type MyChargesState =
  | { status: 'loading' }
  | { status: 'success'; items: MyCharge[] }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseMyChargesResult {
  state: MyChargesState;
  retry: () => void;
}

/**
 * `GET /me/charges` (RF-002-15): los cobros de la persona, filtrados en el servidor por estado y
 * período. Ya vienen ordenados por vencimiento y con los de grupos dejados que aún debe.
 */
export function useMyCharges({ status, period }: MyChargesFilters): UseMyChargesResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: MyChargesState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = `${status ?? 'todos'}|${period ?? 'todos'}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    const params = {
      ...(status ? { status: [status] } : {}),
      ...(period ? { period } : {}),
    };
    listMyCharges(params, { signal: controller.signal }).then(
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
  }, [status, period, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const state: MyChargesState = settled?.key === key ? settled.state : { status: 'loading' };
  return { state, retry };
}
