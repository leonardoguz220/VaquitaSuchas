'use client';

import { useCallback } from 'react';
import {
  createGroupListing,
  getGroupListing,
  getListing,
  isOwnerListing,
  listListings,
  renewGroupListing,
  updateGroupListing,
  withdrawGroupListing,
  type CreateListingRequest,
  type GroupListingSummary,
  type ListListingsParams,
  type OwnerListing,
  type UpdateListingRequest,
} from '@/services/listings';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/**
 * Publicación del grupo vista por el titular (`GET /groups/:id/listing`, plan 008 §6): `null` si
 * no tiene una activa, oculta o expirada.
 */
export function useOwnerListing(groupId: string) {
  const load = useCallback(async (): Promise<OwnerListing | null> => {
    const listing = await getGroupListing(groupId);
    return isOwnerListing(listing) ? listing : null;
  }, [groupId]);
  return useApiResource(load);
}

/** Resumen para un miembro: si el grupo publicó cupos (`GET /groups/:id/listing`). */
export function useGroupListingSummary(groupId: string) {
  const load = useCallback(async (): Promise<GroupListingSummary | null> => {
    const listing = await getGroupListing(groupId);
    if (listing === null || isOwnerListing(listing)) return null;
    return listing;
  }, [groupId]);
  return useApiResource(load);
}

/** Publicar cupos (`POST /groups/:id/listing`, RF-008-01). */
export function useCreateListing(groupId: string) {
  const request = useCallback(
    (input: CreateListingRequest) => createGroupListing(groupId, input),
    [groupId],
  );
  return useApiSubmit(request);
}

/** Editar la publicación (`PATCH /groups/:id/listing`, RF-008-06). */
export function useUpdateListing(groupId: string) {
  const request = useCallback(
    (input: UpdateListingRequest) => updateGroupListing(groupId, input),
    [groupId],
  );
  return useApiSubmit(request);
}

/** Renovar 30 días (`POST /groups/:id/listing/renew`, RF-008-05). */
export function useRenewListing(groupId: string) {
  const request = useCallback(() => renewGroupListing(groupId), [groupId]);
  return useApiSubmit<void, OwnerListing>(request);
}

/** Retirar la publicación (`DELETE /groups/:id/listing`, RF-008-06). */
export function useWithdrawListing(groupId: string) {
  const request = useCallback(() => withdrawGroupListing(groupId), [groupId]);
  return useApiSubmit<void, void>(request);
}

/** Publicaciones por página de `/cupos` (contrato 008: hasta 50). */
export const LISTINGS_PAGE_SIZE = 20;

export type ListingFilters = Pick<
  ListListingsParams,
  'serviceId' | 'category' | 'maxShareCents' | 'sort'
>;

/** Búsqueda de cupos (`GET /listings`, RF-008-07 a RF-008-09) con «Cargar más» por cursor. */
export function useListings({ serviceId, category, maxShareCents, sort }: ListingFilters) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listListings({
        ...(serviceId ? { serviceId } : {}),
        ...(category ? { category } : {}),
        ...(maxShareCents !== undefined ? { maxShareCents } : {}),
        ...(sort ? { sort } : {}),
        limit: LISTINGS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [serviceId, category, maxShareCents, sort],
  );
  return usePaginatedResource(loadPage);
}

/** Detalle de una publicación (`GET /listings/:id`). `404` llega en `error`. */
export function useListing(listingId: string) {
  const load = useCallback(() => getListing(listingId), [listingId]);
  return useApiResource(load);
}
