'use client';

import { useCallback } from 'react';
import {
  enableHost,
  listHostEnablements,
  revokeHostEnablement,
  transferGroupOwnership,
} from '@/services/admin-hosts';
import { usePaginatedResource } from './use-paginated-resource';
import { useApiSubmit } from './use-api-submit';

/** Habilitaciones por página de `/admin/titulares`. */
export const HOST_ENABLEMENTS_PAGE_SIZE = 20;

/** Habilitaciones manuales vigentes (`GET /admin/host-enablements?active=true`, RF-009-21). */
export function useHostEnablements() {
  const loadPage = useCallback(
    (cursor?: string) =>
      listHostEnablements({ limit: HOST_ENABLEMENTS_PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [],
  );
  return usePaginatedResource(loadPage);
}

/** Habilitar o quitar la habilitación manual de una persona (RF-009-21), con motivo. */
export function useHostEnablementAction() {
  const request = useCallback(
    async (input: { userId: string; enable: boolean; reason: string }): Promise<void> => {
      if (input.enable) await enableHost(input.userId, { reason: input.reason });
      else await revokeHostEnablement(input.userId, { reason: input.reason });
    },
    [],
  );
  return useApiSubmit(request);
}

/** Transferir la titularidad de un grupo con titular suspendido (RF-009-24). */
export function useTransferOwnership() {
  const request = useCallback(
    async (input: { groupId: string; toUserId: string; reason: string }): Promise<void> => {
      await transferGroupOwnership(input.groupId, {
        toUserId: input.toUserId,
        reason: input.reason,
      });
    },
    [],
  );
  return useApiSubmit(request);
}
