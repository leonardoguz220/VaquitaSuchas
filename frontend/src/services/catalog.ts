/**
 * Cliente de los endpoints del catálogo de servicios (spec 004, `contracts/api.md`).
 * Una función por endpoint; los tipos salen del contrato congelado. Todos exigen sesión.
 */
import { apiRequest } from './http';

/** Moneda de un precio del catálogo. */
export type CatalogCurrency = 'USD' | 'BS';

/** Categorías cerradas del catálogo (RF-004-03). */
export type CatalogCategory =
  'video' | 'musica' | 'juegos' | 'educacion' | 'almacenamiento' | 'otras';

/** Servicio del catálogo (objeto `CatalogService` del contrato). */
export interface CatalogService {
  id: string;
  slug: string;
  name: string;
  category: CatalogCategory;
  /** Texto para mostrar ("Música", "Video"...), lo entrega el backend. */
  categoryLabel: string;
  logoUrl: string | null;
  brandColor: string | null;
  /** Solo en el listado: precio del plan activo más barato, en su moneda. */
  fromPriceCents?: number;
  fromCurrency?: CatalogCurrency;
  plansCount?: number;
}

/** Plan de un servicio (objeto `CatalogPlan` del contrato). */
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

/** Página de una lista (contrato 000 A: `limit` de 1 a 100 y `cursor` opaco). */
export interface CatalogServicesPage {
  items: CatalogService[];
  nextCursor: string | null;
}

/** Filtros de `GET /catalog/services`. `q` va de 1 a 60 caracteres. */
export interface ListCatalogServicesParams {
  category?: CatalogCategory;
  q?: string;
  limit?: number;
  cursor?: string;
}

/**
 * `GET /catalog/services` (RF-004-04). Solo servicios activos con al menos un plan activo, en
 * orden alfabético (CA-004-01). Lanza `ApiError` `400 VALIDATION_ERROR` con una categoría
 * desconocida.
 */
export function listCatalogServices(
  params: ListCatalogServicesParams = {},
): Promise<CatalogServicesPage> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.q) query.set('q', params.q);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<CatalogServicesPage>(`/api/catalog/services${search ? `?${search}` : ''}`);
}

/** Respuesta 200 de `GET /catalog/services/:slug`. */
export interface CatalogServiceDetail {
  service: CatalogService;
  /** Solo planes activos, ordenados por precio ascendente (CA-004-04). */
  plans: CatalogPlan[];
}

/**
 * `GET /catalog/services/:slug` (RF-004-05). Lanza `ApiError` `404 NOT_FOUND` si el servicio
 * no existe, está inactivo o no tiene planes activos.
 */
export function getCatalogService(slug: string): Promise<CatalogServiceDetail> {
  return apiRequest<CatalogServiceDetail>(`/api/catalog/services/${encodeURIComponent(slug)}`);
}

/** Categoría para el filtro, con la cantidad de servicios. */
export interface CatalogCategoryItem {
  value: CatalogCategory;
  label: string;
  servicesCount: number;
}

/** `GET /catalog/categories` (RF-004-03): las seis categorías. */
export function listCatalogCategories(): Promise<{ items: CatalogCategoryItem[] }> {
  return apiRequest<{ items: CatalogCategoryItem[] }>('/api/catalog/categories');
}
