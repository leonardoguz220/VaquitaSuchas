'use client';

import { useCallback } from 'react';
import { reportListing, type ListingReportInput } from '@/services/listings';
import { useApiSubmit } from './use-api-submit';

/**
 * Reportar una publicación (`POST /listings/:id/reports`, RF-008-17). Envío con `useApiSubmit`:
 * `isSubmitting` mientras envía (el botón queda desactivado), y `send` devuelve `null` si ya hay
 * un envío en curso o si llegó un `401`.
 */
export function useReportListing(listingId: string) {
  const request = useCallback(
    (input: ListingReportInput) => reportListing(listingId, input),
    [listingId],
  );
  const { submit, isSubmitting } = useApiSubmit(request);
  return { send: submit, isSubmitting };
}
