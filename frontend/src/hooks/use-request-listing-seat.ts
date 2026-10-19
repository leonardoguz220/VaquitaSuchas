'use client';

import { useCallback } from 'react';
import { requestListingSeat, type ListingSeatInput } from '@/services/listings';
import { useApiSubmit } from './use-api-submit';

/**
 * Pedir un cupo de una publicación (`POST /listings/:id/requests`, RF-008-10). Envío con
 * `useApiSubmit`: `isSubmitting` mientras envía (el botón queda desactivado), y `send` devuelve
 * `null` si ya hay un envío en curso o si llegó un `401`.
 */
export function useRequestListingSeat(listingId: string) {
  const request = useCallback(
    (input: ListingSeatInput) => requestListingSeat(listingId, input),
    [listingId],
  );
  const { submit, isSubmitting } = useApiSubmit(request);
  return { send: submit, isSubmitting };
}
