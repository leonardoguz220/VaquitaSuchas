'use client';

import { useCallback } from 'react';
import {
  deleteAndSuspendListing,
  deleteListing,
  listReportedListings,
  restoreListing,
  type ListingModerationResult,
} from '@/services/admin-moderation';
import { useApiResource } from './use-api-resource';
import { useApiSubmit, type ApiSubmitResult } from './use-api-submit';

export type ModerationDecision =
  | { type: 'restaurar'; listingId: string; reason: string }
  | { type: 'eliminar'; listingId: string; reason: string }
  | { type: 'eliminar_y_suspender'; listingId: string; reason: string };

function runDecision(decision: ModerationDecision): Promise<ListingModerationResult> {
  switch (decision.type) {
    case 'restaurar':
      return restoreListing(decision.listingId, decision.reason);
    case 'eliminar':
      return deleteListing(decision.listingId, decision.reason);
    case 'eliminar_y_suspender':
      return deleteAndSuspendListing(decision.listingId, decision.reason);
  }
}

/**
 * Cola de moderación (`GET /admin/listings/reports`, RF-009-12). Al decidir sobre una publicación,
 * la cola se vuelve a pedir: cada fila refleja lo que devuelve el servidor.
 */
export function useAdminModeration() {
  const resource = useApiResource(listReportedListings);
  const { refresh } = resource;
  const { submit, isSubmitting } = useApiSubmit(runDecision);

  const decide = useCallback(
    async (
      decision: ModerationDecision,
    ): Promise<ApiSubmitResult<ListingModerationResult> | null> => {
      const outcome = await submit(decision);
      if (outcome?.ok) void refresh();
      return outcome;
    },
    [submit, refresh],
  );

  return { ...resource, decide, isDeciding: isSubmitting };
}
