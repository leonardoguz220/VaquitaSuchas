/**
 * Cliente del catálogo de administración (spec 009, `contracts/api.md`, Catálogo; RF-009-04 a
 * RF-009-07). Una función por endpoint. Por ahora responde con datos simulados de
 * `admin-catalog.mock.ts`; al conectar el backend solo cambia el cuerpo por `apiRequest`.
 * Los montos viajan en centavos. El frontend no calcula precios ni ahorros: muestra lo que llega.
 */
import type { CatalogCategory, CatalogCurrency } from './catalog';
import * as mock from './admin-catalog.mock';

/** Límites de cupos del contrato (RF-009-07). */
export const CATALOG_MIN_SLOTS = 2;
export const CATALOG_MAX_SLOTS = 20;

/** Aviso que devuelve la API al tocar precio o cupos de un plan (RF-009-05, CA-009-04). */
export const CATALOG_EDIT_WARNING = 'No cambia las suscripciones existentes';

export interface AdminCatalogPlan {
  id: string;
  serviceId: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: CatalogCurrency;
  maxSlots: number;
  individualPriceCents: number | null;
  /** `null` mientras el precio no esté verificado. */
  verifiedOn: string | null;
  active: boolean;
}

export interface AdminCatalogService {
  id: string;
  slug: string;
  name: string;
  category: CatalogCategory;
  active: boolean;
  plans: AdminCatalogPlan[];
}

export interface ServiceInput {
  name: string;
  slug: string;
  category: CatalogCategory;
}

export interface PlanInput {
  name: string;
  slug: string;
  priceCents: number;
  currency: CatalogCurrency;
  maxSlots: number;
  individualPriceCents: number | null;
}

/** Respuesta de crear o editar un plan: el aviso aparece cuando se tocan precio o cupos. */
export interface PlanSaveResult {
  plan: AdminCatalogPlan;
  warning: string | null;
}

/** `GET /admin/catalog`: servicios con todos sus planes, activos e inactivos. */
export function listAdminCatalog(): Promise<AdminCatalogService[]> {
  return mock.listCatalog();
}

/** `POST /admin/catalog/services` (CA-009-02, CA-009-03). */
export function createCatalogService(input: ServiceInput): Promise<AdminCatalogService> {
  return mock.createService(input);
}

/** `PATCH /admin/catalog/services/:id`. */
export function updateCatalogService(
  id: string,
  input: ServiceInput,
): Promise<AdminCatalogService> {
  return mock.updateService(id, input);
}

/** `POST /admin/catalog/services/:id/activate|deactivate`. */
export function setCatalogServiceActive(id: string, active: boolean): Promise<AdminCatalogService> {
  return mock.setServiceActive(id, active);
}

/** `POST /admin/catalog/services/:id/plans` (CA-009-02). */
export function createCatalogPlan(serviceId: string, input: PlanInput): Promise<PlanSaveResult> {
  return mock.createPlan(serviceId, input);
}

/** `PATCH /admin/catalog/plans/:id` (RF-009-05, CA-009-04). */
export function updateCatalogPlan(id: string, input: PlanInput): Promise<PlanSaveResult> {
  return mock.updatePlan(id, input);
}

/** `POST /admin/catalog/plans/:id/activate|deactivate` (CA-009-05). */
export function setCatalogPlanActive(id: string, active: boolean): Promise<AdminCatalogPlan> {
  return mock.setPlanActive(id, active);
}
