'use client';

import { useCallback, useState } from 'react';
import {
  getAdminDispute,
  getAdminDisputeEvidence,
  listAdminDisputes,
  resolveAdminDispute,
  type AdminDisputeResult,
} from '@/services/admin-disputes';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';

/** Cola de reclamos, abiertos primero (`GET /admin/disputes`, RF-009-20). */
export function useAdminDisputes() {
  const load = useCallback(() => listAdminDisputes(), []);
  return useApiResource(load);
}

export interface ResolveInput {
  result: AdminDisputeResult;
  reason: string;
}

/**
 * Un reclamo: su ficha, la evidencia y la resolución. La evidencia se pide solo cuando la persona
 * pulsa «Ver evidencia», porque cada consulta queda en auditoría (CA-009-27).
 */
export function useAdminDispute(disputeId: string) {
  const loadDispute = useCallback(() => getAdminDispute(disputeId), [disputeId]);
  const dispute = useApiResource(loadDispute);
  const { replace } = dispute;

  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const loadEvidence = useCallback(() => getAdminDisputeEvidence(disputeId), [disputeId]);
  const evidence = useApiResource(evidenceRequested ? loadEvidence : null);

  const request = useCallback(
    (input: ResolveInput) => resolveAdminDispute(disputeId, input.result, input.reason),
    [disputeId],
  );
  const { submit, isSubmitting } = useApiSubmit(request);

  /** Resuelve el reclamo; con éxito reemplaza la ficha por la que devuelve la API. */
  const resolve = useCallback(
    async (input: ResolveInput) => {
      const outcome = await submit(input);
      if (outcome?.ok) replace(outcome.data);
      return outcome;
    },
    [submit, replace],
  );

  return {
    dispute,
    evidence,
    requestEvidence: () => setEvidenceRequested(true),
    evidenceRequested,
    resolve,
    isResolving: isSubmitting,
  };
}
