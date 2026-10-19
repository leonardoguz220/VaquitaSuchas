'use client';

import { useCallback, useState } from 'react';
import {
  getAdminDisputeEvidence,
  listAdminDisputes,
  resolveAdminDispute,
  type AdminDisputeEvidence,
} from '@/services/admin-disputes';
import type { DisputeResult } from '@/services/join-requests';
import { toApiError, type ApiError } from '@/services/http';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Reclamos por página de `/admin/reclamos`. */
export const ADMIN_DISPUTES_PAGE_SIZE = 20;

/** Cola de reclamos (`GET /admin/disputes`, RF-009-20): los abiertos primero, según la API. */
export function useAdminDisputes() {
  const loadPage = useCallback(
    (cursor?: string) =>
      listAdminDisputes({ limit: ADMIN_DISPUTES_PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [],
  );
  return usePaginatedResource(loadPage);
}

export type EvidenceStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Evidencia de un reclamo **a pedido** (CA-009-27): no se pide al abrir la pantalla, solo al
 * pulsar «Ver evidencia», porque cada apertura queda registrada en la auditoría.
 */
export function useAdminDisputeEvidence(disputeId: string) {
  const [state, setState] = useState<{
    status: EvidenceStatus;
    data: AdminDisputeEvidence | null;
    error: ApiError | null;
  }>({ status: 'idle', data: null, error: null });
  const redirectIfUnauthorized = useUnauthorizedRedirect();

  const open = useCallback(async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await getAdminDisputeEvidence(disputeId);
      setState({ status: 'success', data, error: null });
    } catch (caught) {
      const error = toApiError(caught);
      if (redirectIfUnauthorized(error)) return;
      setState({ status: 'error', data: null, error });
    }
  }, [disputeId, redirectIfUnauthorized]);

  return { ...state, open };
}

/** Resolver un reclamo (`POST /admin/disputes/:id/resolve`, RF-010-24) con resultado y motivo. */
export function useResolveDispute(disputeId: string) {
  const request = useCallback(
    (input: { result: DisputeResult; reason: string }) => resolveAdminDispute(disputeId, input),
    [disputeId],
  );
  return useApiSubmit(request);
}
