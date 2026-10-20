'use client';

import { useCallback, useState } from 'react';
import { toApiError, type ApiError } from '@/services/http';
import { useApiResource } from './use-api-resource';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Página de una lista de la API (contrato 000 A). */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Lista paginada por cursor para una pantalla protegida: la primera página con `useApiResource`
 * (cargando, error con `reload`, `401` → `/ingresar`) y las siguientes con `loadMore`. `loadPage`
 * debe ser estable (`useCallback`); si cambia (otro filtro), se vuelve a la primera página.
 */
export function usePaginatedResource<P extends Page<unknown>>(
  loadPage: (cursor?: string) => Promise<P>,
) {
  type T = P['items'][number];
  const loadFirst = useCallback(() => loadPage(), [loadPage]);
  const first = useApiResource(loadFirst);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // Páginas siguientes, ligadas a la primera respuesta: si se vuelve a cargar, se descartan.
  const [more, setMore] = useState<{
    base: P | null;
    items: T[];
    nextCursor: string | null;
  } | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<ApiError | null>(null);

  const extra = more && more.base === first.data ? more : null;
  const items: T[] = first.data ? [...(first.data.items as T[]), ...(extra?.items ?? [])] : [];
  const nextCursor = extra ? extra.nextCursor : (first.data?.nextCursor ?? null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await loadPage(nextCursor);
      setMore({
        base: first.data,
        items: [...(extra?.items ?? []), ...(page.items as T[])],
        nextCursor: page.nextCursor,
      });
    } catch (caught) {
      const error = toApiError(caught);
      if (!redirectIfUnauthorized(error)) setLoadMoreError(error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadPage, nextCursor, isLoadingMore, first.data, extra, redirectIfUnauthorized]);

  return {
    status: first.status,
    error: first.error,
    reload: first.reload,
    /** Vuelve a pedir la primera página sin pasar por "cargando". */
    refresh: first.refresh,
    /** Primera página tal cual la entregó la API (con sus campos extra, p. ej. `unreadCount`). */
    firstPage: first.data,
    items,
    hasMore: Boolean(nextCursor),
    loadMore,
    isLoadingMore,
    loadMoreError,
  };
}
