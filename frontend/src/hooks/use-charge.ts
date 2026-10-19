'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCharge, type Charge } from '@/services/charges';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** `forbidden`: `403` (otro miembro del grupo); `not_found`: `404` (CA-002-12, CA-002-23). */
export type ChargeState =
  | { status: 'loading' }
  | { status: 'success'; charge: Charge }
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseChargeResult {
  state: ChargeState;
  retry: () => void;
  /** Muestra el cobro que devolvió la API tras una acción (T022, T026), sin recargar. */
  update: (charge: Charge) => void;
}

/** `GET /charges/:chargeId`: el detalle de un cobro propio o, para el titular, de su grupo. */
export function useCharge(chargeId: string): UseChargeResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; state: ChargeState } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = `${chargeId}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    getCharge(chargeId, { signal: controller.signal }).then(
      (charge) => {
        if (!controller.signal.aborted) setSettled({ key, state: { status: 'success', charge } });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        let next: ChargeState;
        if (redirectRef.current(error)) next = { status: 'redirecting' };
        else if (error.statusCode === 403) next = { status: 'forbidden' };
        else if (error.statusCode === 404) next = { status: 'not_found' };
        else next = { status: 'error', error };
        setSettled({ key, state: next });
      },
    );
    return () => controller.abort();
  }, [chargeId, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const update = useCallback(
    (charge: Charge) => setSettled({ key, state: { status: 'success', charge } }),
    [key],
  );
  const state: ChargeState = settled?.key === key ? settled.state : { status: 'loading' };
  return { state, retry, update };
}
