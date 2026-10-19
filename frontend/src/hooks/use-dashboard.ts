'use client';

import { useCallback } from 'react';
import { saveBlob } from '@/lib/download';
import type { ApiDownload } from '@/services/http';
import {
  listHistory,
  type HistoryFilters,
  getCalendar,
  getUpcomingEvents,
  getDashboard,
  getDashboardCharts,
  getGroupCollection,
  listDashboard,
  type DashboardListName,
} from '@/services/reports';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
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

/**
 * Cobranza de un grupo del titular (`GET /groups/:id/collection`, RF-006-06). Con
 * `period = null` el backend elige el mes. `403` y `404` llegan en `error`.
 */
export function useGroupCollection(groupId: string, period: string | null) {
  const load = useCallback(
    () => getGroupCollection(groupId, period ?? undefined),
    [groupId, period],
  );
  return useApiResource(load);
}

/** Series de los gráficos del panel (`GET /me/dashboard/charts`, RF-006-07 a RF-006-09). */
export function useDashboardCharts({ month, groupId }: DashboardFilters) {
  const load = useCallback(
    () =>
      getDashboardCharts({
        ...(month ? { month } : {}),
        ...(groupId ? { groupId } : {}),
      }),
    [month, groupId],
  );
  return useApiResource(load);
}

/** Cortes y vencimientos del mes (`GET /me/calendar`, RF-006-11). `null`: el mes actual. */
export function useCalendar(month: string | null) {
  const load = useCallback(() => getCalendar(month ?? undefined), [month]);
  return useApiResource(load);
}

/** Lista «Próximos 30 días» (`GET /me/calendar/upcoming?days=30`, RF-006-11). */
export function useUpcomingEvents() {
  const load = useCallback(() => getUpcomingEvents(30), []);
  return useApiResource(load);
}

/** Cobros por página del historial (contrato 000 A: `limit` de 1 a 100). */
export const HISTORY_PAGE_SIZE = 25;

/**
 * Historial propio (`GET /me/history`, RF-006-13) con filtros de mes, suscripción y estado
 * aplicados por la API y «Cargar más» por cursor.
 */
export function useHistory({ period, groupId, status }: HistoryFilters) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listHistory({
        ...(period ? { period } : {}),
        ...(groupId ? { groupId } : {}),
        ...(status ? { status } : {}),
        limit: HISTORY_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [period, groupId, status],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Descarga de un CSV (RF-006-14): pide el archivo y lo guarda con el nombre del servidor (o
 * `fallbackName` si no lo envía). Devuelve el resultado de `useApiSubmit` para mostrar los
 * errores (`429` con la espera, `422 EXPORT_TOO_LARGE`, `403`).
 */
export function useCsvDownload(request: () => Promise<ApiDownload>, fallbackName: string) {
  const download = useCallback(async () => {
    const file = await request();
    const filename = file.filename ?? fallbackName;
    saveBlob(file.blob, filename);
    return { filename };
  }, [request, fallbackName]);
  return useApiSubmit<void, { filename: string }>(download);
}
