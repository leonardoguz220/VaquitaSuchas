/**
 * Publicación de cupos del titular (`specs/008-cupos-libres/contracts/api.md`, sección de
 * `/groups/:groupId/listing`). Cada función llama al backend por el proxy `/api`; los datos
 * simulados de `group-listing.mock.ts` solo los usan los tests. Las cuotas y los estados llegan
 * calculados: aquí no se calcula ninguna regla del dominio.
 */
import { apiRequest } from './http';
import type { ListingView } from './listings';

export type OwnerListingStatus = 'activa' | 'oculta' | 'expirada' | 'retirada' | 'cerrada';

/** Lo que ve el titular del grupo (`OwnerListing`, contrato 008). */
export interface OwnerListing {
  id: string;
  groupId: string;
  status: OwnerListingStatus;
  slotsOffered: number;
  description: string | null;
  conditions: string | null;
  publishedAt: string;
  /** ISO 8601 en UTC: `publishedAt` o la última renovación + 30 días. */
  expiresAt: string;
  renewedAt: string | null;
  hiddenAt: string | null;
  endReason: string | null;
  /** Reportes desde la última restauración. */
  reportCount: number;
  /** Solicitudes activas originadas en esta publicación. */
  openRequests: number;
  /** Cómo la vería el público; `null` si la publicación ya no está abierta. */
  preview: ListingView | null;
  version: number;
}

/** Lo que ve un miembro: solo si el grupo tiene una publicación activa. */
export interface GroupListingSummary {
  active: boolean;
  slotsOffered: number | null;
  expiresAt: string | null;
}

/** Campos del formulario de publicación (RF-008-01). Los textos vacíos llegan como `null`. */
export interface ListingFormInput {
  slotsOffered: number;
  description: string | null;
  conditions: string | null;
}

/** `PATCH /groups/:groupId/listing`: solo los campos que cambian, más la versión en pantalla. */
export interface UpdateListingInput extends Partial<ListingFormInput> {
  version?: number;
}

export interface ListingRequestOptions {
  signal?: AbortSignal;
}

/** Ruta de la publicación del grupo, por el proxy `/api`. */
function listingPath(groupId: string): string {
  return `/api/groups/${encodeURIComponent(groupId)}/listing`;
}

/** `GET /groups/:groupId/listing` para el titular: la más reciente o `null` si nunca publicó. */
export function getOwnerListing(
  groupId: string,
  options: ListingRequestOptions = {},
): Promise<OwnerListing | null> {
  return apiRequest<OwnerListing | null>(listingPath(groupId), { signal: options.signal });
}

/** `GET /groups/:groupId/listing` para un miembro: si el grupo tiene publicación activa. */
export function getGroupListingSummary(
  groupId: string,
  options: ListingRequestOptions = {},
): Promise<GroupListingSummary> {
  return apiRequest<GroupListingSummary>(listingPath(groupId), { signal: options.signal });
}

/** `POST /groups/:groupId/listing` (RF-008-01): publica en `activa` por 30 días. */
export function createOwnerListing(
  groupId: string,
  input: ListingFormInput,
): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(listingPath(groupId), { method: 'POST', body: input });
}

/** `PATCH /groups/:groupId/listing` (RF-008-06): edita una `activa` u `oculta`. */
export function updateOwnerListing(
  groupId: string,
  input: UpdateListingInput,
): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(listingPath(groupId), { method: 'PATCH', body: input });
}

/** `POST /groups/:groupId/listing/renew` (RF-008-05): vuelve a 30 días desde ahora. */
export function renewOwnerListing(groupId: string): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(`${listingPath(groupId)}/renew`, { method: 'POST' });
}

/** `DELETE /groups/:groupId/listing` (RF-008-06): pasa la publicación a `retirada`. */
export function retireOwnerListing(groupId: string): Promise<void> {
  return apiRequest<void>(listingPath(groupId), { method: 'DELETE' });
}
