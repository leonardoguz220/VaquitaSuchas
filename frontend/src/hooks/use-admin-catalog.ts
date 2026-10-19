'use client';

import { useCallback } from 'react';
import {
  createCatalogPlan,
  createCatalogService,
  listAdminCatalog,
  setCatalogPlanActive,
  setCatalogServiceActive,
  updateCatalogPlan,
  updateCatalogService,
  type PlanInput,
  type PlanSaveResult,
  type ServiceInput,
} from '@/services/admin-catalog';
import { useApiResource } from './use-api-resource';
import { useApiSubmit, type ApiSubmitResult } from './use-api-submit';

export type CatalogAction =
  | { type: 'createService'; input: ServiceInput }
  | { type: 'updateService'; id: string; input: ServiceInput }
  | { type: 'setServiceActive'; id: string; active: boolean }
  | { type: 'createPlan'; serviceId: string; input: PlanInput }
  | { type: 'updatePlan'; id: string; input: PlanInput }
  | { type: 'setPlanActive'; id: string; active: boolean };

/** Resultado común: solo los planes que tocan precio o cupos traen aviso. */
export interface CatalogActionResult {
  warning: string | null;
}

async function runAction(action: CatalogAction): Promise<CatalogActionResult> {
  switch (action.type) {
    case 'createService':
      await createCatalogService(action.input);
      return { warning: null };
    case 'updateService':
      await updateCatalogService(action.id, action.input);
      return { warning: null };
    case 'setServiceActive':
      await setCatalogServiceActive(action.id, action.active);
      return { warning: null };
    case 'createPlan':
      return toResult(await createCatalogPlan(action.serviceId, action.input));
    case 'updatePlan':
      return toResult(await updateCatalogPlan(action.id, action.input));
    case 'setPlanActive':
      await setCatalogPlanActive(action.id, action.active);
      return { warning: null };
  }
}

function toResult(saved: PlanSaveResult): CatalogActionResult {
  return { warning: saved.warning };
}

/**
 * Catálogo de administración (`GET /admin/catalog`, RF-009-04). Cada alta, edición o cambio de
 * estado vuelve a pedir la lista para que la pantalla muestre lo que guardó la API.
 */
export function useAdminCatalog() {
  const load = useCallback(() => listAdminCatalog(), []);
  const resource = useApiResource(load);
  const { refresh } = resource;
  const { submit, isSubmitting } = useApiSubmit(runAction);

  const act = useCallback(
    async (action: CatalogAction): Promise<ApiSubmitResult<CatalogActionResult> | null> => {
      const outcome = await submit(action);
      if (outcome?.ok) void refresh();
      return outcome;
    },
    [submit, refresh],
  );

  return { ...resource, act, isSubmitting };
}
