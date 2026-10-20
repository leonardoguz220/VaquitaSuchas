'use client';

import { useCallback, useRef, useState } from 'react';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

export type ApiSubmitResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Envío de un formulario de una pantalla protegida (spec 003 T039): cargando, éxito con la
 * respuesta y error con el `ApiError` tal cual. Devuelve `null` si ya había un envío en curso o
 * si llegó un `401` (sesión vencida), porque entonces ya se está yendo a `/ingresar?next=…`.
 * Permite reintentar el último cuerpo tras un error de conexión. Mismo patrón que
 * `useResetPassword`. El cuerpo (puede llevar contraseñas) solo vive en memoria.
 */
export function useApiSubmit<I, T>(request: (input: I) => Promise<T>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);
  const lastInput = useRef<{ value: I } | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const submit = useCallback(
    async (input: I): Promise<ApiSubmitResult<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      lastInput.current = { value: input };
      setIsSubmitting(true);
      try {
        return { ok: true, data: await request(input) };
      } catch (caught) {
        const error = toApiError(caught);
        if (redirectIfUnauthorized(error)) return null;
        return { ok: false, error };
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [request, redirectIfUnauthorized],
  );

  /** Vuelve a enviar el último cuerpo (botón "Reintentar"). */
  const retry = useCallback(async (): Promise<ApiSubmitResult<T> | null> => {
    if (!lastInput.current) return null;
    return submit(lastInput.current.value);
  }, [submit]);

  /** Olvida el último cuerpo (por ejemplo, tras cambiar la contraseña con éxito). */
  const forget = useCallback(() => {
    lastInput.current = null;
  }, []);

  return { submit, retry, forget, isSubmitting };
}
