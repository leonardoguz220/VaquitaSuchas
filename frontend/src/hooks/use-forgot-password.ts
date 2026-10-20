'use client';

import { useCallback, useRef, useState } from 'react';
import {
  forgotPassword,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
} from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';

export type ForgotPasswordStatus = 'idle' | 'submitting' | 'success' | 'error';

export type ForgotPasswordResult =
  { ok: true; data: ForgotPasswordResponse } | { ok: false; error: ApiError };

/**
 * Estado del envío de `POST /auth/password/forgot` (RF-003-10): cargando, error (el `ApiError`
 * tal cual, para decidir la UX por `code`) y éxito. Ignora un segundo envío mientras hay uno en
 * curso y permite reintentar el último cuerpo tras un error de conexión. Mismo patrón que
 * `useLogin`.
 */
export function useForgotPassword() {
  const [status, setStatus] = useState<ForgotPasswordStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const lastInput = useRef<ForgotPasswordRequest | null>(null);

  const submit = useCallback(
    async (input: ForgotPasswordRequest): Promise<ForgotPasswordResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      lastInput.current = input;
      setStatus('submitting');
      setError(null);
      try {
        const data = await forgotPassword(input);
        setStatus('success');
        return { ok: true, data };
      } catch (caught) {
        const apiError = toApiError(caught);
        setError(apiError);
        setStatus('error');
        return { ok: false, error: apiError };
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  /** Vuelve a enviar el último cuerpo (botón "Reintentar"). */
  const retry = useCallback(async (): Promise<ForgotPasswordResult | null> => {
    if (!lastInput.current) return null;
    return submit(lastInput.current);
  }, [submit]);

  return { status, error, submit, retry, isSubmitting: status === 'submitting' };
}
