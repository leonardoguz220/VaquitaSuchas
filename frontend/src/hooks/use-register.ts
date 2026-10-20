'use client';

import { useCallback, useRef, useState } from 'react';
import { register, type RegisterRequest, type RegisterResponse } from '@/services/auth';
import { toApiError, type ApiError } from '@/services/http';

export type RegisterStatus = 'idle' | 'submitting' | 'success' | 'error';

export type RegisterResult = { ok: true; data: RegisterResponse } | { ok: false; error: ApiError };

export interface UseRegisterOptions {
  /** Se llama una vez con la respuesta 201 (por ejemplo, para ir a `/registro/verificar`). */
  onSuccess?: (data: RegisterResponse) => void;
}

/**
 * Estado del envío de `POST /auth/register` (RF-003-01): cargando, error (el `ApiError` tal
 * cual, para decidir la UX por `code`) y éxito. Ignora un segundo envío mientras hay uno en
 * curso y permite reintentar el último cuerpo tras un error de conexión.
 */
export function useRegister({ onSuccess }: UseRegisterOptions = {}) {
  const [status, setStatus] = useState<RegisterStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const lastInput = useRef<RegisterRequest | null>(null);

  const submit = useCallback(
    async (input: RegisterRequest): Promise<RegisterResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      lastInput.current = input;
      setStatus('submitting');
      setError(null);
      try {
        const data = await register(input);
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
  const retry = useCallback(async (): Promise<RegisterResult | null> => {
    if (!lastInput.current) return null;
    return submit(lastInput.current);
  }, [submit]);

  return { status, error, submit, retry, isSubmitting: status === 'submitting' };
}
