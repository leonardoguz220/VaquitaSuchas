/**
 * Publicación de cupos del titular (`specs/008-cupos-libres/contracts/api.md`, sección de
 * `/groups/:groupId/listing`). Por ahora cada función responde con datos simulados de
 * `group-listing.mock.ts`; al conectar el backend solo cambia el cuerpo de estas funciones por
 * `apiRequest` al proxy `/api`. Las cuotas y los estados llegan calculados: aquí no se calcula
 * ninguna regla del dominio.
 */
import * as mock from './group-listing.mock';
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

/** `GET /groups/:groupId/listing` para el titular: la más reciente o `null` si nunca publicó. */
export function getOwnerListing(
  groupId: string,
  options: ListingRequestOptions = {},
): Promise<OwnerListing | null> {
  return mock.getOwnerListing(groupId, options.signal);
}

/** `GET /groups/:groupId/listing` para un miembro: si el grupo tiene publicación activa. */
export function getGroupListingSummary(
  groupId: string,
  options: ListingRequestOptions = {},
): Promise<GroupListingSummary> {
  return mock.getGroupListingSummary(groupId, options.signal);
}

/** `POST /groups/:groupId/listing` (RF-008-01): publica en `activa` por 30 días. */
export function createOwnerListing(
  groupId: string,
  input: ListingFormInput,
): Promise<OwnerListing> {
  return mock.createOwnerListing(groupId, input);
}

/** `PATCH /groups/:groupId/listing` (RF-008-06): edita una `activa` u `oculta`. */
export function updateOwnerListing(
  groupId: string,
  input: UpdateListingInput,
): Promise<OwnerListing> {
  return mock.updateOwnerListing(groupId, input);
}

/** `POST /groups/:groupId/listing/renew` (RF-008-05): vuelve a 30 días desde ahora. */
export function renewOwnerListing(groupId: string): Promise<OwnerListing> {
  return mock.renewOwnerListing(groupId);
}

/** `DELETE /groups/:groupId/listing` (RF-008-06): pasa la publicación a `retirada`. */
export function retireOwnerListing(groupId: string): Promise<void> {
  return mock.retireOwnerListing(groupId);
}
