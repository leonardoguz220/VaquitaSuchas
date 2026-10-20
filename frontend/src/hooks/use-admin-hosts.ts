'use client';

import { useCallback } from 'react';
import { grantHostEnablement, listHostEnablements, revokeHostEnablement } from '@/services/admin';
import { useApiResource } from './use-api-resource';
import { useApiSubmit, type ApiSubmitResult } from './use-api-submit';

/** Habilitaciones manuales vigentes (RF-009-21) con alta y baja con motivo (CA-009-28). */
export function useAdminHosts() {
  const resource = useApiResource(listHostEnablements);
  const { refresh } = resource;

  const grant = useApiSubmit(
    useCallback(
      (input: { userId: string; reason: string }) =>
        grantHostEnablement(input.userId, input.reason),
      [],
    ),
  );
  const revoke = useApiSubmit(
    useCallback(
      (input: { userId: string; reason: string }) =>
        revokeHostEnablement(input.userId, input.reason),
      [],
    ),
  );

  /** Tras un alta o una baja exitosa, vuelve a pedir la lista. */
  const grantAndRefresh = useCallback(
    async (input: { userId: string; reason: string }): Promise<ApiSubmitResult<unknown> | null> => {
      const outcome = await grant.submit(input);
      if (outcome?.ok) void refresh();
      return outcome;
    },
    [grant, refresh],
  );
  const revokeAndRefresh = useCallback(
    async (input: { userId: string; reason: string }): Promise<ApiSubmitResult<unknown> | null> => {
      const outcome = await revoke.submit(input);
      if (outcome?.ok) void refresh();
      return outcome;
    },
    [revoke, refresh],
  );

  return {
    ...resource,
    grant: grantAndRefresh,
    grantPending: grant.isSubmitting,
    revoke: revokeAndRefresh,
    revokePending: revoke.isSubmitting,
  };
}
