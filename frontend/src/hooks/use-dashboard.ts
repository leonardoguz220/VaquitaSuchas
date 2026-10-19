'use client';

import { useCallback } from 'react';
import { getDashboard, listDashboard, type DashboardListName } from '@/services/reports';
import { useApiResource } from './use-api-resource';
import { usePaginatedResource } from './use-paginated-resource';

/** Cobros por página de las listas del panel (contrato 000 A: `limit` de 1 a 100). */
export const DASHBOARD_LIST_PAGE_SIZE = 10;

export interface DashboardFilters {
  /** `YYYY-MM` o `null` para el mes actual que elige el backend. */
  month: string | null;
  /** `null` para todas las suscripciones. */
  groupId: string | null;
}

/**
 * Resumen del panel (`GET /me/dashboard`, RF-006-01 a RF-006-06): el mes y la suscripción los
 * aplica la API. Si cambia un filtro, se vuelve a pedir.
 */
export function useDashboard({ month, groupId }: DashboardFilters) {
  const load = useCallback(
    () =>
      getDashboard({
        ...(month ? { month } : {}),
        ...(groupId ? { groupId } : {}),
      }),
    [month, groupId],
  );
  return useApiResource(load);
}

/**
 * Lista «Debo», «En revisión» o «Me deben» del panel (`GET /me/dashboard/lists`, RF-006-04 y
 * RF-006-05), con «Ver más» por cursor. «Debo» incluye todos los períodos.
 */
export function useDashboardList(list: DashboardListName) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listDashboard({ list, limit: DASHBOARD_LIST_PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [list],
  );
  return usePaginatedResource(loadPage);
}
