'use client';

import { useCallback } from 'react';
import type { CatalogCategory } from '@/services/catalog';
import { listListings, type ListingSort } from '@/services/listings';
import { usePaginatedResource } from './use-paginated-resource';

/** Publicaciones por página de «Cupos libres» (contrato 008: `limit` de 1 a 50). */
export const LISTINGS_PAGE_SIZE = 6;

/** Filtros de la búsqueda; los montos van en centavos y `null` significa sin límite. */
export interface ListingFilters {
  q: string;
  category: CatalogCategory | null;
  minShareCents: number | null;
  maxShareCents: number | null;
  sort: ListingSort;
}

/**
 * Cupos libres (`GET /listings`, RF-008-07 a RF-008-09). Cada cambio de filtro vuelve a la primera
 * página; «Cargar más» sigue el `nextCursor` de la API.
 */
export function useListings(filters: ListingFilters) {
  const { q, category, minShareCents, maxShareCents, sort } = filters;
  const loadPage = useCallback(
    (cursor?: string) =>
      listListings({
        q,
        category: category ?? undefined,
        minShareCents,
        maxShareCents,
        sort,
        limit: LISTINGS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [q, category, minShareCents, maxShareCents, sort],
  );
  return usePaginatedResource(loadPage);
}
