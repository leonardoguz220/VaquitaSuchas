/**
 * Cliente del catálogo de servicios (`specs/004-catalogo-de-servicios/contracts/api.md`).
 * Todos los endpoints exigen sesión: el proxy `/api` agrega el token desde la cookie httpOnly.
 */
import { apiRequest } from './http';

export type CatalogCategory =
  'video' | 'musica' | 'juegos' | 'educacion' | 'almacenamiento' | 'otras';

export type CatalogCurrency = 'USD' | 'BS';

export interface CatalogService {
  id: string;
  slug: string;
  name: string;
  category: CatalogCategory;
  /** Etiqueta para mostrar («Música», «Video»…). */
  categoryLabel: string;
  logoUrl: string | null;
  brandColor: string | null;
  /** Solo en el listado: el plan activo más barato (lo calcula el backend). */
  fromPriceCents?: number;
  fromCurrency?: CatalogCurrency;
  plansCount?: number;
}

export interface CatalogPlan {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: CatalogCurrency;
  /** Cupos máximos, titular incluido. */
  maxSlots: number;
  /** Misma moneda que el plan; `null` si no hay dato (CA-004-11). */
  individualPriceCents: number | null;
  verifiedOn: string | null;
}

/** Listas del contrato 000 A.1: `nextCursor` opaco, `null` en la última página. */
export interface CatalogServicesPage {
  items: CatalogService[];
  nextCursor: string | null;
}

export interface CatalogServiceDetail {
  service: CatalogService;
  /** Solo planes activos, ordenados por precio ascendente (CA-004-04). */
  plans: CatalogPlan[];
}

export interface CatalogCategoryOption {
  value: CatalogCategory;
  label: string;
  servicesCount: number;
}

export interface CatalogCategoriesResponse {
  items: CatalogCategoryOption[];
}

/**
 * Tamaño de página del selector. El contrato 000 A.1 permite de 1 a 100, pero el backend recorta
 * `limit` a 50 (`MAX_CATALOG_PAGE_SIZE`): por eso se piden 20 y nunca más de 50. A decidir por backend.
 */
export const CATALOG_PAGE_SIZE = 20;

export interface ListServicesParams {
  category?: CatalogCategory;
  /** 1 a 60 caracteres; el backend ignora mayúsculas y tildes. */
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface CatalogRequestOptions {
  signal?: AbortSignal;
}

/** `GET /catalog/services` (RF-004-04): servicios activos con al menos un plan activo. */
export function listServices(
  params: ListServicesParams = {},
  options: CatalogRequestOptions = {},
): Promise<CatalogServicesPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? CATALOG_PAGE_SIZE) });
  if (params.category) query.set('category', params.category);
  const q = params.q?.trim();
  if (q) query.set('q', q);
  if (params.cursor) query.set('cursor', params.cursor);
  return apiRequest<CatalogServicesPage>(`/api/catalog/services?${query.toString()}`, {
    signal: options.signal,
  });
}

/** `GET /catalog/services/:slug` (RF-004-05): `404 NOT_FOUND` si no existe o no tiene planes activos. */
export function getService(
  slug: string,
  options: CatalogRequestOptions = {},
): Promise<CatalogServiceDetail> {
  return apiRequest<CatalogServiceDetail>(`/api/catalog/services/${encodeURIComponent(slug)}`, {
    signal: options.signal,
  });
}

/** `GET /catalog/categories` (RF-004-03): las seis categorías con su cantidad de servicios. */
export function listCategories(
  options: CatalogRequestOptions = {},
): Promise<CatalogCategoriesResponse> {
  return apiRequest<CatalogCategoriesResponse>('/api/catalog/categories', {
    signal: options.signal,
  });
}
