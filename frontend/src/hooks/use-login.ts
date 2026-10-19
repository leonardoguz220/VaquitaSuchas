'use client';

import { useCallback, useRef, useState } from 'react';
import { login, type LoginRequest, type LoginResponse } from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';

export type LoginStatus = 'idle' | 'submitting' | 'success' | 'error';

export type LoginResult = { ok: true; data: LoginResponse } | { ok: false; error: ApiError };

export interface UseLoginOptions {
  /** Se llama una vez con la respuesta 200 (por ejemplo, para ir a `next`). */
  onSuccess?: (data: LoginResponse) => void;
}

/**
 * Estado del envío de `POST /auth/login` (RF-003-06): cargando, error (el `ApiError` tal cual,
 * para decidir la UX por `code`) y éxito. Ignora un segundo envío mientras hay uno en curso y
 * permite reintentar el último cuerpo tras un error de conexión. Mismo patrón que `useRegister`.
 */
export function useLogin({ onSuccess }: UseLoginOptions = {}) {
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const lastInput = useRef<LoginRequest | null>(null);

  const submit = useCallback(
    async (input: LoginRequest): Promise<LoginResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      lastInput.current = input;
      setStatus('submitting');
      setError(null);
      try {
        const data = await login(input);
        setStatus('success');
        onSuccess?.(data);
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
    [onSuccess],
  );

  /** Vuelve a enviar el último cuerpo (botón "Reintentar"). */
  const retry = useCallback(async (): Promise<LoginResult | null> => {
    if (!lastInput.current) return null;
    return submit(lastInput.current);
  }, [submit]);

  return { status, error, submit, retry, isSubmitting: status === 'submitting' };
}
