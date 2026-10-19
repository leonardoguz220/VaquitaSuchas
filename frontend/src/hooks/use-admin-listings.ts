'use client';

import { useCallback } from 'react';
import {
  listReportedListings,
  moderateListing,
  type ModerationAction,
} from '@/services/admin-listings';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Publicaciones por página de `/admin/moderacion`. */
export const MODERATION_PAGE_SIZE = 20;

/** Cola de publicaciones reportadas u ocultas (`GET /admin/listings/reports`, RF-009-12). */
export function useReportedListings() {
  const loadPage = useCallback(
    (cursor?: string) =>
      listReportedListings({ limit: MODERATION_PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [],
  );
  return usePaginatedResource(loadPage);
}

/** Restaurar, eliminar o eliminar y suspender con motivo (RF-009-13). */
export function useModerateListing() {
  const request = useCallback(
    (input: { listingId: string; action: ModerationAction; reason: string }) =>
      moderateListing(input.listingId, input.action, { reason: input.reason }),
    [],
  );
  return useApiSubmit(request);
}
