/**
 * Cliente de los endpoints de cupos libres (spec 008, `contracts/api.md`, búsqueda y detalle). Una
 * función por endpoint y tipos del contrato. El frontend muestra `estimatedShareCents`,
 * `slotsOffered`, `owner.level` y `entryWindow` tal como llegan: no calcula cuotas, niveles ni
 * estados de la ventana. Por ahora las funciones responden con datos simulados de
 * `listings.mock.ts`; al conectar el backend solo cambia el cuerpo por `apiRequest`.
 */
import type { CatalogCategory } from './catalog';
import type { JoinRequest } from './join-requests';
import * as mock from './listings.mock';
import type { RatingLevel } from './reputation';

/** Orden del contrato: por cuota, por fecha de publicación o por puntualidad del titular. */
export type ListingSort = 'cuota' | 'fecha' | 'puntualidad';

/** Servicio de la publicación: copia del grupo (contrato 008). */
export interface ListingService {
  name: string;
  planName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  category: CatalogCategory | null;
}

/** Titular: nombre y nivel de puntualidad (spec 007). Sin estrellas: el contrato no las incluye. */
export interface ListingOwner {
  fullName: string;
  level: RatingLevel;
}

/** Ventana de ingreso del grupo (spec 001). Fechas ISO 8601 en UTC. */
export interface ListingEntryWindow {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export type ListingCannotRequestReason =
  | 'VENTANA_CERRADA'
  | 'SOLICITUD_ACTIVA'
  | 'DEMASIADAS_SOLICITUDES'
  | 'COBROS_ABIERTOS'
  | 'SIN_CUPOS'
  | 'CUENTA_RESTRINGIDA';

/** Lo que ve cualquier usuario de una publicación (RF-008-03, RF-008-04, RNF-008-01). */
export interface ListingView {
  id: string;
  service: ListingService;
  /** Cupos ofrecidos que siguen libres en este momento. */
  slotsOffered: number;
  /** Cuota estimada en centavos (RN-008-02). Siempre rotulada «estimada». */
  estimatedShareCents: number;
  estimatedShareLabel: 'estimada';
  billingDay: number;
  owner: ListingOwner;
  /** Texto plano: nunca se interpreta como HTML ni se convierte en enlaces (RNF-008-05). */
  description: string | null;
  conditions: string | null;
  publishedAt: string;
  expiresAt: string;
  entryWindow: ListingEntryWindow;
  myRequest: { id: string; status: string } | null;
  canRequest: boolean;
  cannotRequestReason: ListingCannotRequestReason | null;
}

export interface ListingsPage {
  items: ListingView[];
  nextCursor: string | null;
}

/** Filtros de «Cupos libres» (RF-008-09). Los montos van en centavos; `null` = sin límite. */
export interface ListListingsParams {
  /** Texto en el nombre del servicio, sin distinguir mayúsculas ni tildes. */
  q?: string;
  category?: CatalogCategory;
  minShareCents?: number | null;
  maxShareCents?: number | null;
  sort?: ListingSort;
  /** Hasta 50 (contrato 008). */
  limit?: number;
  cursor?: string;
}

export interface ListingRequestOptions {
  signal?: AbortSignal;
}

/** Cuerpo de `POST /listings/:id/requests`: el mensaje es opcional, hasta 200 caracteres. */
export interface ListingSeatInput {
  message?: string;
}

/**
 * Solicitud que se abre desde una publicación. El contrato devuelve el `JoinRequest` completo
 * (spec 010); esta pantalla solo necesita el `id` para ir a `/solicitudes/[id]`.
 */
export type ListingSeatRequest = Pick<JoinRequest, 'id'>;

/** Motivos del reporte de una publicación (contrato 008, RF-008-17). */
export type ListingReportReason = 'spam' | 'datos_falsos' | 'conducta_indebida' | 'otro';

/** Largo máximo del comentario del reporte (contrato 008). */
export const LISTING_REPORT_COMMENT_MAX = 300;

/** Cuerpo de `POST /listings/:id/reports`: el comentario es opcional, hasta 300 caracteres. */
export interface ListingReportInput {
  reason: ListingReportReason;
  comment?: string;
}

/** Ruta del contrato para reportar una publicación, por el proxy `/api`. */
export function listingReportPath(listingId: string): string {
  return `/api/listings/${encodeURIComponent(listingId)}/reports`;
}

/** Ruta del contrato para pedir un cupo, por el proxy `/api`. */
export function listingRequestPath(listingId: string): string {
  return `/api/listings/${encodeURIComponent(listingId)}/requests`;
}

/**
 * Arma la query de `GET /listings` con los nombres del contrato. Solo agrega lo que tiene valor,
 * así una búsqueda sin filtros va sin parámetros.
 */
export function buildListingsQuery(params: ListListingsParams = {}): URLSearchParams {
  const query = new URLSearchParams();
  const q = params.q?.trim();
  if (q) query.set('q', q);
  if (params.category) query.set('category', params.category);
  if (params.minShareCents != null) query.set('minShareCents', String(params.minShareCents));
  if (params.maxShareCents != null) query.set('maxShareCents', String(params.maxShareCents));
  if (params.sort) query.set('sort', params.sort);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  return query;
}

/**
 * `GET /listings` (RF-008-07 a RF-008-09): publicaciones abiertas que buscan miembros, sin las
 * propias ni las de grupos donde ya es miembro (RF-008-08). Sin conexión lanza `ApiError`.
 */
export function listListings(
  params: ListListingsParams = {},
  options: ListingRequestOptions = {},
): Promise<ListingsPage> {
  return mock.listListings(buildListingsQuery(params), options);
}

/**
 * `GET /listings/:id`: el detalle de una publicación. Lanza `ApiError` `404 LISTING_NOT_FOUND`
 * si no existe, no está activa, es propia o es de un grupo donde ya es miembro.
 */
export function getListing(
  listingId: string,
  options: ListingRequestOptions = {},
): Promise<ListingView> {
  return mock.getListing(listingId, options);
}

/**
 * `POST /listings/:id/requests` (RF-008-10; CA-008-08 a 10, 23): abre una solicitud `abierta` con
 * el mensaje opcional. Lanza `ApiError` `400 VALIDATION_ERROR` (mensaje de más de 200),
 * `404 LISTING_NOT_FOUND`, `403 ACCOUNT_RESTRICTED` o `422 BUSINESS_RULE` con `details.code`
 * (`ENTRY_WINDOW_CLOSED`, `ACTIVE_REQUEST_EXISTS`, `TOO_MANY_ACTIVE_REQUESTS`,
 * `OPEN_CHARGES_IN_GROUP`, `NO_SLOTS_AVAILABLE`). Con la API conectada, el cuerpo será
 * `apiRequest(listingRequestPath(id), { method: 'POST', body: { message } })`.
 */
export function requestListingSeat(
  listingId: string,
  input: ListingSeatInput,
  options: ListingRequestOptions = {},
): Promise<ListingSeatRequest> {
  return mock.requestListingSeat(listingId, input, options);
}

/**
 * `POST /listings/:id/reports` (RF-008-17): reporta una publicación. Responde `204`, sin cuerpo.
 * Lanza `ApiError` `409 ALREADY_REPORTED` si el usuario ya la reportó, `404 LISTING_NOT_FOUND`,
 * `422 BUSINESS_RULE` (`CANNOT_REPORT_OWN_LISTING`), `429 RATE_LIMITED` (10 por día),
 * `403 ACCOUNT_RESTRICTED` o `400 VALIDATION_ERROR` (comentario de más de 300). Con la API
 * conectada, el cuerpo será `apiRequest(listingReportPath(id), { method: 'POST', body: input })`.
 */
export function reportListing(
  listingId: string,
  input: ListingReportInput,
  options: ListingRequestOptions = {},
): Promise<void> {
  return mock.reportListing(listingId, input, options);
}
