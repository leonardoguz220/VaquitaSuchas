'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/**
 * `loading`: cargando. `success`: hay datos. `error`: falló (mostrar aviso con Reintentar).
 * `redirecting`: llegó un `401` y se está yendo a `/ingresar?next=…`.
 */
export type ResourceStatus = 'loading' | 'success' | 'error' | 'redirecting';

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  error: ApiError | null;
}

/**
 * Carga un recurso de la API para una pantalla protegida (specs 001 y 004), con el mismo patrón
 * que `useMe`: un `401` lleva a `/ingresar?next=<ruta actual>` y otro error queda en `error`
 * para mostrar el aviso con `reload`. `load` debe ser estable (`useCallback`); si cambia, se
 * vuelve a pedir y se descarta la respuesta anterior. Con `load = null` no pide nada.
 */
export function useApiResource<T>(load: (() => Promise<T>) | null) {
  const [state, setState] = useState<ResourceState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // Se guarda en una ref para que un cambio de ruta no vuelva a pedir los datos.
  const redirectRef = useRef(redirectIfUnauthorized);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    if (!load) return;
    let active = true;
    // Cada intento empieza cargando (también al cambiar `load`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading', data: null, error: null });
    load().then(
      (data) => {
        if (active) setState({ status: 'success', data, error: null });
      },
      (caught: unknown) => {
        if (!active) return;
        const error = toApiError(caught);
        const redirecting = redirectRef.current(error);
        setState({ status: redirecting ? 'redirecting' : 'error', data: null, error });
      },
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);

  /** Vuelve a pedir el recurso (botón "Reintentar"). */
  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  /** Reemplaza los datos por los que devolvió otra llamada, sin volver a pedirlos. */
  const replace = useCallback((data: T) => setState({ status: 'success', data, error: null }), []);

  return { ...state, reload, replace };
}
