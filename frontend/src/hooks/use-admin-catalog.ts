'use client';

import { useCallback } from 'react';
import {
  applyCatalogImport,
  createCatalogPlan,
  createCatalogService,
  previewCatalogImport,
  setCatalogPlanActive,
  setCatalogServiceActive,
  updateCatalogPlan,
  updateCatalogService,
  type CatalogPlanInput,
  type CatalogServiceInput,
} from '@/services/admin-catalog';
import { getCatalogService, listCatalogServices } from '@/services/catalog';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Servicios por página de `/admin/catalogo`. */
export const ADMIN_CATALOG_PAGE_SIZE = 50;

/**
 * Servicios del catálogo para el administrador. [NECESITA ACLARACIÓN] No hay un listado de
 * administración: se usa `GET /catalog/services` (spec 004), que solo trae los activos.
 */
export function useAdminCatalogServices() {
  const loadPage = useCallback(
    (cursor?: string) =>
      listCatalogServices({ limit: ADMIN_CATALOG_PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [],
  );
  return usePaginatedResource(loadPage);
}

/** Planes activos de un servicio (`GET /catalog/services/:slug`), solo cuando se despliega. */
export function useAdminCatalogPlans(slug: string) {
  const load = useCallback(() => getCatalogService(slug), [slug]);
  return useApiResource(load);
}

/** Crear o editar un servicio (RF-009-04). */
export function useSaveCatalogService() {
  const request = useCallback(
    (input: { id: string | null; values: CatalogServiceInput }) =>
      input.id ? updateCatalogService(input.id, input.values) : createCatalogService(input.values),
    [],
  );
  return useApiSubmit(request);
}

/** Crear o editar un plan (RF-009-04, RF-009-05). */
export function useSaveCatalogPlan() {
  const request = useCallback((input: { id: string | null; values: CatalogPlanInput }) => {
    if (!input.id) return createCatalogPlan(input.values);
    const { slug, name, priceCents, currency, maxSlots, individualPriceCents, verifiedOn } =
      input.values;
    return updateCatalogPlan(input.id, {
      slug,
      name,
      priceCents,
      currency,
      maxSlots,
      individualPriceCents,
      verifiedOn,
    });
  }, []);
  return useApiSubmit(request);
}

/** Activar o desactivar un servicio o un plan (RF-009-04). */
export function useCatalogActivation() {
  const request = useCallback(
    async (input: { entity: 'service' | 'plan'; id: string; active: boolean }): Promise<void> => {
      if (input.entity === 'service') await setCatalogServiceActive(input.id, input.active);
      else await setCatalogPlanActive(input.id, input.active);
    },
    [],
  );
  return useApiSubmit(request);
}

/** Vista previa de una importación (RF-009-06): no cambia nada. */
export function useCatalogImportPreview() {
  return useApiSubmit(previewCatalogImport);
}

/** Aplicar una importación con su token: todo o nada (CA-009-06). */
export function useCatalogImportApply() {
  return useApiSubmit(applyCatalogImport);
}
