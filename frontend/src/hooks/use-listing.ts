'use client';

import { useCallback } from 'react';
import { getListing } from '@/services/listings';
import { useApiResource } from './use-api-resource';

/**
 * Detalle de una publicación (`GET /listings/:id`, RF-008-07). `404 LISTING_NOT_FOUND` llega en
 * `error`; un `401` lleva a `/ingresar`.
 */
export function useListing(listingId: string) {
  const load = useCallback(() => getListing(listingId), [listingId]);
  return useApiResource(load);
}
