'use client';

import { useCallback } from 'react';
import {
  createGroupListing,
  getGroupListing,
  isOwnerListing,
  renewGroupListing,
  updateGroupListing,
  withdrawGroupListing,
  type CreateListingRequest,
  type GroupListingSummary,
  type OwnerListing,
  type UpdateListingRequest,
} from '@/services/listings';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';

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
