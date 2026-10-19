/**
 * Cliente de los endpoints de cupos libres (spec 008, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato. La cuota estimada, los cupos disponibles y si se puede
 * solicitar los calcula el backend: el frontend solo los muestra (la cuota, rotulada «estimada»).
 */
import type { JoinRequest } from './join-requests';
import type { ReputationLevel } from './reputation';
import { apiRequest } from './http';

export type ListingStatus = 'activa' | 'oculta' | 'expirada' | 'retirada' | 'cerrada';

export type CannotRequestReason =
  | 'VENTANA_CERRADA'
  | 'SOLICITUD_ACTIVA'
  | 'DEMASIADAS_SOLICITUDES'
  | 'COBROS_ABIERTOS'
  | 'SIN_CUPOS'
  | 'CUENTA_RESTRINGIDA';

/** Lo que ve cualquier usuario (RF-008-03, RF-008-04, RNF-008-01). Sin datos de miembros ni de pago. */
export interface ListingView {
  id: string;
  service: {
    name: string;
    planName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    category: string | null;
  };
  slotsOffered: number;
  /** RN-008-02: siempre «estimada». */
  estimatedShareCents: number;
  estimatedShareLabel: 'estimada';
  billingDay: number;
  /** Nivel de puntualidad del titular (spec 007); sin estrellas exactas (plan 008 §7). */
  owner: { fullName: string; level: ReputationLevel };
  /** Texto plano. */
  description: string | null;
  /** Texto plano. */
  conditions: string | null;
  /** ISO 8601 en UTC. */
  publishedAt: string;
  /** ISO 8601 en UTC. */
  expiresAt: string;
  entryWindow: { isOpen: boolean; opensAt: string | null; closesAt: string | null };
  /** Solicitud activa propia en ese grupo. */
  myRequest: { id: string; status: string } | null;
  canRequest: boolean;
  cannotRequestReason: CannotRequestReason | null;
}

/** Publicación vista por el titular del grupo. */
export interface OwnerListing {
  id: string;
  groupId: string;
  status: ListingStatus;
  slotsOffered: number;
  description: string | null;
  conditions: string | null;
  publishedAt: string;
  expiresAt: string;
  renewedAt: string | null;
  hiddenAt: string | null;
  endReason: string | null;
  /** Solo desde la última restauración. */
  reportCount: number;
  /** Solicitudes activas originadas en la publicación. */
  openRequests: number;
  preview: ListingView | null;
  version: number;
}

/** Lo que ve un miembro: si el grupo tiene una publicación activa. */
export interface GroupListingSummary {
  active: boolean;
  slotsOffered: number | null;
  expiresAt: string | null;
}

/** Largo máximo de la descripción y de las condiciones (RF-008-01). */
export const LISTING_TEXT_MAX = 300;

export interface CreateListingRequest {
  slotsOffered: number;
  description?: string;
  conditions?: string;
}

export interface UpdateListingRequest {
  slotsOffered?: number;
  description?: string;
  conditions?: string;
  version?: number;
}

function groupListingPath(groupId: string): string {
  return `/api/groups/${encodeURIComponent(groupId)}/listing`;
}

/** Distingue la respuesta del titular (`OwnerListing`) de la del miembro (`GroupListingSummary`). */
export function isOwnerListing(
  value: OwnerListing | GroupListingSummary | null,
): value is OwnerListing {
  return value !== null && 'status' in value;
}

/**
 * `GET /groups/:groupId/listing`: el titular recibe `OwnerListing | null` (la más reciente:
 * activa, oculta o expirada) y un miembro `GroupListingSummary`. `404` si no pertenece.
 */
export function getGroupListing(
  groupId: string,
): Promise<OwnerListing | GroupListingSummary | null> {
  return apiRequest<OwnerListing | GroupListingSummary | null>(groupListingPath(groupId));
}

/** `POST /groups/:groupId/listing` (RF-008-01, RF-008-02): `201` con la publicación `activa`. */
export function createGroupListing(
  groupId: string,
  input: CreateListingRequest,
): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(groupListingPath(groupId), { method: 'POST', body: input });
}

/** `PATCH /groups/:groupId/listing` (RF-008-06): `409 STALE_STATE` si cambió. */
export function updateGroupListing(
  groupId: string,
  input: UpdateListingRequest,
): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(groupListingPath(groupId), { method: 'PATCH', body: input });
}

/** `POST /groups/:groupId/listing/renew` (RF-008-05): 30 días más; sirve para activa y expirada. */
export function renewGroupListing(groupId: string): Promise<OwnerListing> {
  return apiRequest<OwnerListing>(`${groupListingPath(groupId)}/renew`, { method: 'POST' });
}

/** `DELETE /groups/:groupId/listing` (RF-008-06): `204`, pasa a `retirada`. */
export function withdrawGroupListing(groupId: string): Promise<void> {
  return apiRequest<void>(groupListingPath(groupId), { method: 'DELETE' });
}

export type ListingSort = 'cuota' | 'fecha' | 'puntualidad';

export interface ListListingsParams {
  serviceId?: string;
  q?: string;
  category?: string;
  minShareCents?: number;
  maxShareCents?: number;
  sort?: ListingSort;
  /** Hasta 50. */
  limit?: number;
  cursor?: string;
}

export interface ListingsPage {
  items: ListingView[];
  nextCursor: string | null;
}

/**
 * `GET /listings` (RF-008-07 a RF-008-09): solo publicaciones activas con cupo, sin las propias
 * ni las de grupos donde ya es miembro (RF-008-08). Los filtros y el orden los aplica la API.
 */
export function listListings(params: ListListingsParams = {}): Promise<ListingsPage> {
  const query = new URLSearchParams();
  if (params.serviceId) query.set('serviceId', params.serviceId);
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.minShareCents !== undefined) query.set('minShareCents', String(params.minShareCents));
  if (params.maxShareCents !== undefined) query.set('maxShareCents', String(params.maxShareCents));
  if (params.sort) query.set('sort', params.sort);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<ListingsPage>(`/api/listings${search ? `?${search}` : ''}`);
}

/** `GET /listings/:id`: `404 LISTING_NOT_FOUND` si no está activa, es propia o ya es miembro. */
export function getListing(listingId: string): Promise<ListingView> {
  return apiRequest<ListingView>(`/api/listings/${encodeURIComponent(listingId)}`);
}

/** Largo máximo del mensaje inicial de la solicitud (RF-008-10). */
export const LISTING_MESSAGE_MAX = 200;

/**
 * `POST /listings/:id/requests` (RF-008-10): abre una solicitud de ingreso de la spec 010 con
 * `source = "publicacion"`; el mensaje, si hay, es la primera línea del chat. `201` con la
 * `JoinRequest`. Errores como `POST /join-requests` (`422 BUSINESS_RULE`) y `400` (mensaje largo).
 */
export function requestListingSeat(
  listingId: string,
  input: { message?: string },
): Promise<JoinRequest> {
  return apiRequest<JoinRequest>(`/api/listings/${encodeURIComponent(listingId)}/requests`, {
    method: 'POST',
    body: input,
  });
}
