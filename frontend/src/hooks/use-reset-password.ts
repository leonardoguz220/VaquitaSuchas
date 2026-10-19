'use client';

import { useCallback, useRef, useState } from 'react';
import { resetPassword, type ResetPasswordRequest } from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';

export type ResetPasswordStatus = 'idle' | 'submitting' | 'success' | 'error';

export type ResetPasswordResult = { ok: true } | { ok: false; error: ApiError };

/**
 * Estado del envío de `POST /auth/password/reset` (RF-003-12): cargando, error (el `ApiError`
 * tal cual) y éxito (204). Ignora un segundo envío mientras hay uno en curso y permite
 * reintentar el último cuerpo tras un error de conexión. Mismo patrón que `useLogin`.
 * El cuerpo (con el token) solo vive en memoria; no se registra.
 */
export function useResetPassword() {
  const [status, setStatus] = useState<ResetPasswordStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const lastInput = useRef<ResetPasswordRequest | null>(null);

  const submit = useCallback(
    async (input: ResetPasswordRequest): Promise<ResetPasswordResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      lastInput.current = input;
      setStatus('submitting');
      setError(null);
      try {
        await resetPassword(input);
        setStatus('success');
        return { ok: true };
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
  const retry = useCallback(async (): Promise<ResetPasswordResult | null> => {
    if (!lastInput.current) return null;
    return submit(lastInput.current);
  }, [submit]);

  return { status, error, submit, retry, isSubmitting: status === 'submitting' };
}
