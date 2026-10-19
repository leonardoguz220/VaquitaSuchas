'use client';

import { useCallback, useState } from 'react';
import {
  getCatalogService,
  listCatalogServices,
  type CatalogService,
  type ListCatalogServicesParams,
} from '@/services/catalog';
import { toApiError, type ApiError } from '@/services/http';
import { useApiResource } from './use-api-resource';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Servicios por página del selector (contrato 000 A: `limit` de 1 a 100). */
export const CATALOG_PAGE_SIZE = 50;

type Filters = Pick<ListCatalogServicesParams, 'category' | 'q'>;

/**
 * Lista de servicios del selector (`GET /catalog/services`, RF-004-04) con "Ver más" por cursor.
 * Los filtros se agregan con la búsqueda (spec 004 T016); el orden es el de la API.
 */
export function useCatalogServices(filters: Filters = {}) {
  const { category, q } = filters;
  const load = useCallback(
    () => listCatalogServices({ category, q, limit: CATALOG_PAGE_SIZE }),
    [category, q],
  );
  const first = useApiResource(load);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // Páginas siguientes, ligadas a la primera respuesta: si se vuelve a cargar, se descartan.
  const [more, setMore] = useState<{
    base: typeof first.data;
    items: CatalogService[];
    nextCursor: string | null;
  } | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<ApiError | null>(null);

  const extra = more && more.base === first.data ? more : null;
  const items = first.data ? [...first.data.items, ...(extra?.items ?? [])] : [];
  const nextCursor = extra ? extra.nextCursor : (first.data?.nextCursor ?? null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listCatalogServices({
        category,
        q,
        limit: CATALOG_PAGE_SIZE,
        cursor: nextCursor,
      });
      setMore({
        base: first.data,
        items: [...(extra?.items ?? []), ...page.items],
        nextCursor: page.nextCursor,
      });
    } catch (caught) {
      const error = toApiError(caught);
      if (!redirectIfUnauthorized(error)) setLoadMoreError(error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [category, q, nextCursor, isLoadingMore, first.data, extra, redirectIfUnauthorized]);

  return {
    status: first.status,
    error: first.error,
    reload: first.reload,
    items,
    hasMore: Boolean(nextCursor),
    loadMore,
    isLoadingMore,
    loadMoreError,
  };
}

/**
 * Detalle de un servicio con sus planes activos (`GET /catalog/services/:slug`, RF-004-05).
 * Un `404 NOT_FOUND` llega en `error` (servicio desactivado o sin planes activos).
 */
export function useCatalogService(slug: string) {
  const load = useCallback(() => getCatalogService(slug), [slug]);
  return useApiResource(load);
}
