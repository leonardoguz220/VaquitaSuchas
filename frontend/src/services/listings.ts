/**
 * Cliente de los endpoints de cupos libres (spec 008, `contracts/api.md`, búsqueda y detalle). Una
 * función por endpoint y tipos del contrato. El frontend muestra `estimatedShareCents`,
 * `slotsOffered`, `owner.level` y `entryWindow` tal como llegan: no calcula cuotas, niveles ni
 * estados de la ventana. Por ahora las funciones responden con datos simulados de
 * `listings.mock.ts`; al conectar el backend solo cambia el cuerpo por `apiRequest`.
 */
import type { CatalogCategory } from './catalog';
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
