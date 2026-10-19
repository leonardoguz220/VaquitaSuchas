'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CATALOG_PAGE_SIZE, listServices, type CatalogService } from '@/services/catalog';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/**
 * `loading`: cargando. `success`: llegó la lista (puede venir vacía). `error`: falló por otra
 * causa (aviso con Reintentar). `redirecting`: llegó un `401` y se va a `/ingresar?next=…`.
 */
export type CatalogServicesState =
  | { status: 'loading' }
  | { status: 'success'; items: CatalogService[]; nextCursor: string | null }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

export interface UseCatalogServicesResult {
  state: CatalogServicesState;
  /** Vuelve a pedir la lista desde el principio (botón «Reintentar»). */
  retry: () => void;
  /** Pide la página siguiente si `nextCursor` no es `null`. */
  loadMore: () => void;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
}

const LOADING: CatalogServicesState = { status: 'loading' };

/**
 * Listado inicial del selector de servicio (`GET /catalog/services`, RF-004-04). Muestra los
 * servicios tal como los ordena y filtra el backend; la búsqueda y las categorías son T016.
 */
export function useCatalogServices(): UseCatalogServicesResult {
  const [state, setState] = useState<CatalogServicesState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // En una ref para que un cambio de ruta no vuelva a pedir la lista.
  const redirectRef = useRef(redirectIfUnauthorized);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  const fail = useCallback((caught: unknown): CatalogServicesState => {
    const error = toApiError(caught);
    return redirectRef.current(error) ? { status: 'redirecting' } : { status: 'error', error };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listServices({}, { signal: controller.signal }).then(
      (page) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', items: page.items, nextCursor: page.nextCursor });
        }
      },
      (caught: unknown) => {
        if (!controller.signal.aborted) setState(fail(caught));
      },
    );
    return () => {
      controller.abort();
      moreController.current?.abort();
    };
  }, [attempt, fail]);

  const retry = useCallback(() => {
    moreController.current?.abort();
    setIsLoadingMore(false);
    setLoadMoreFailed(false);
    setState(LOADING);
    setAttempt((current) => current + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (state.status !== 'success' || state.nextCursor === null || isLoadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    listServices(
      { cursor: state.nextCursor, limit: CATALOG_PAGE_SIZE },
      { signal: controller.signal },
    ).then(
      (page) => {
        if (controller.signal.aborted) return;
        setState((current) =>
          current.status === 'success'
            ? {
                status: 'success',
                items: [...current.items, ...page.items],
                nextCursor: page.nextCursor,
              }
            : current,
        );
        setIsLoadingMore(false);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setIsLoadingMore(false);
        if (redirectRef.current(toApiError(caught))) setState({ status: 'redirecting' });
        else setLoadMoreFailed(true);
      },
    );
  }, [state, isLoadingMore]);

  return { state, retry, loadMore, isLoadingMore, loadMoreFailed };
}
