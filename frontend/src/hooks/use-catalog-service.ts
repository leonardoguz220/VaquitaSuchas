'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getService, type CatalogPlan, type CatalogService } from '@/services/catalog';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/**
 * `idle`: no hay servicio elegido. `not_found`: el backend respondió `404` (no existe, está
 * inactivo o ya no tiene planes activos). `redirecting`: llegó un `401`.
 */
export type CatalogServiceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; service: CatalogService; plans: CatalogPlan[] }
  | { status: 'not_found' }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseCatalogServiceResult {
  state: CatalogServiceState;
  /** Vuelve a pedir el detalle del servicio elegido (botón «Reintentar»). */
  retry: () => void;
}

/** Resultado guardado junto con el intento que lo produjo, para no mostrar uno viejo. */
interface Settled {
  key: string;
  state: CatalogServiceState;
}

/**
 * Detalle de un servicio con sus planes activos (`GET /catalog/services/:slug`, RF-004-05).
 * Entrega los planes en el orden de la API, que ya vienen por precio ascendente (CA-004-04).
 */
export function useCatalogService(slug: string | null): UseCatalogServiceResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  const redirectRef = useRef(redirectIfUnauthorized);
  const key = slug === null ? null : `${slug}#${attempt}`;

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    if (slug === null || key === null) return;
    const controller = new AbortController();
    getService(slug, { signal: controller.signal }).then(
      (detail) => {
        if (controller.signal.aborted) return;
        setSettled({
          key,
          state: { status: 'success', service: detail.service, plans: detail.plans },
        });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        let next: CatalogServiceState;
        if (redirectRef.current(error)) next = { status: 'redirecting' };
        else if (error.statusCode === 404) next = { status: 'not_found' };
        else next = { status: 'error', error };
        setSettled({ key, state: next });
      },
    );
    return () => controller.abort();
  }, [slug, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  let state: CatalogServiceState;
  if (key === null) state = { status: 'idle' };
  else if (settled?.key === key) state = settled.state;
  else state = { status: 'loading' };

  return { state, retry };
}
