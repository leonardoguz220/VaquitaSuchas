'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getHostEligibility, type HostEligibility } from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type HostEligibilityState =
  | { status: 'loading' }
  | { status: 'success'; eligibility: HostEligibility }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseHostEligibilityResult {
  state: HostEligibilityState;
  retry: () => void;
}

/** `GET /users/me/host-eligibility` (RF-001-21): si el usuario puede crear una suscripción. */
export function useHostEligibility(): UseHostEligibilityResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ attempt: number; state: HostEligibilityState } | null>(
    null,
  );
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    getHostEligibility({ signal: controller.signal }).then(
      (eligibility) => {
        if (!controller.signal.aborted) {
          setSettled({ attempt, state: { status: 'success', eligibility } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        setSettled({
          attempt,
          state: redirectRef.current(error)
            ? { status: 'redirecting' }
            : { status: 'error', error },
        });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const state: HostEligibilityState =
    settled?.attempt === attempt ? settled.state : { status: 'loading' };
  return { state, retry };
}
