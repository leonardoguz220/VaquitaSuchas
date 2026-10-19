'use client';

import { useCallback } from 'react';
import {
  ACTIVE_JOIN_STATUSES,
  FINAL_JOIN_STATUSES,
  listJoinRequests,
  openJoinRequest,
} from '@/services/join-requests';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Solicitudes por página de "Mis solicitudes" (contrato 000 A: `limit` de 1 a 100). */
export const MY_REQUESTS_PAGE_SIZE = 20;

/** Pestañas de "Mis solicitudes": las activas o el historial (estados finales). */
export type MyRequestsScope = 'activas' | 'historial';

/**
 * "Mis solicitudes" (`GET /join-requests?role=solicitante`, RF-010-26): el filtro por estados lo
 * aplica la API y "Ver más" sigue el cursor. Al cambiar de pestaña se vuelve a la primera página.
 */
export function useMyJoinRequests(scope: MyRequestsScope) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listJoinRequests({
        role: 'solicitante',
        status: scope === 'activas' ? ACTIVE_JOIN_STATUSES : FINAL_JOIN_STATUSES,
        limit: MY_REQUESTS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [scope],
  );
  return usePaginatedResource(loadPage);
}

/** Abrir una solicitud con el código de invitación (`POST /join-requests`, RF-010-01). */
export function useOpenJoinRequest() {
  return useApiSubmit(openJoinRequest);
}
