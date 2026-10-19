'use client';

import { useCallback } from 'react';
import {
  getCatalogService,
  listCatalogCategories,
  listCatalogServices,
  type ListCatalogServicesParams,
} from '@/services/catalog';
import { useApiResource } from './use-api-resource';
import { usePaginatedResource } from './use-paginated-resource';

/** Servicios por página del selector (contrato 000 A: `limit` de 1 a 100). */
export const CATALOG_PAGE_SIZE = 50;

type Filters = Pick<ListCatalogServicesParams, 'category' | 'q'>;

/**
 * Lista de servicios del selector (`GET /catalog/services`, RF-004-04) con "Ver más" por cursor.
 * Los filtros se agregan con la búsqueda (spec 004 T016); el orden es el de la API.
 */
export function useCatalogServices(filters: Filters = {}) {
  const { category, q } = filters;
  const loadPage = useCallback(
    (cursor?: string) =>
      listCatalogServices({
        category,
        q,
        limit: CATALOG_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [category, q],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Detalle de un servicio con sus planes activos (`GET /catalog/services/:slug`, RF-004-05).
 * Un `404 NOT_FOUND` llega en `error` (servicio desactivado o sin planes activos).
 */
export function useCatalogService(slug: string) {
  const load = useCallback(() => getCatalogService(slug), [slug]);
  return useApiResource(load);
}

/** Las categorías del catálogo con su texto (`GET /catalog/categories`, RF-004-03). */
export function useCatalogCategories() {
  return useApiResource(listCatalogCategories);
}
