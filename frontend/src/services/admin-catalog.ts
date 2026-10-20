/**
 * Cliente del catálogo de administración (spec 009, `contracts/api.md`, Catálogo; RF-009-04 a
 * RF-009-07). Una función por endpoint, conectado al backend (`/api/admin/catalog`). El backend
 * responde `isActive`; aquí se expone como `active` para la pantalla. Los montos viajan en
 * centavos. El frontend no calcula precios ni ahorros: muestra lo que llega.
 */
import type { CatalogCategory, CatalogCurrency } from './catalog';
import { apiRequest } from './http';
export {
  CATALOG_EDIT_WARNING,
  CATALOG_MAX_SLOTS,
  CATALOG_MIN_SLOTS,
} from './admin-catalog.constants';

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

/** Fila de la vista previa de importación: qué se crearía o actualizaría (RF-009-06). */
export interface CatalogImportChange {
  row: number;
  kind: 'servicio' | 'plan';
  slug: string;
  action: 'crear' | 'actualizar';
}

/** Error por fila de la importación: `field` dice qué campo falló (CA-009-06). */
export interface CatalogImportRowError {
  row: number;
  field: string;
  message: string;
}

/** Vista previa: `token` solo existe si no hay errores; aplicar exige el token. */
export interface CatalogImportPreview {
  token: string | null;
  changes: CatalogImportChange[];
  errors: CatalogImportRowError[];
}

export interface CatalogImportApplied {
  created: number;
  updated: number;
}

export type CatalogImportFormat = 'csv' | 'json';

/** Forma que devuelve el backend (`ServiceView` y `PlanView`). */
interface ApiPlan {
  id: string;
  serviceId: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: CatalogCurrency;
  maxSlots: number;
  individualPriceCents: number | null;
  verifiedOn: string | null;
  verifiedSource: string | null;
  isActive: boolean;
  warning?: string;
}

interface ApiService {
  id: string;
  slug: string;
  name: string;
  category: CatalogCategory;
  logoUrl: string | null;
  brandColor: string | null;
  isActive: boolean;
  plans?: ApiPlan[];
  warning?: string;
}

const toPlan = (view: ApiPlan): AdminCatalogPlan => ({
  id: view.id,
  serviceId: view.serviceId,
  slug: view.slug,
  name: view.name,
  priceCents: view.priceCents,
  currency: view.currency,
  maxSlots: view.maxSlots,
  individualPriceCents: view.individualPriceCents,
  verifiedOn: view.verifiedOn,
  active: view.isActive,
});

const toService = (view: ApiService): AdminCatalogService => ({
  id: view.id,
  slug: view.slug,
  name: view.name,
  category: view.category,
  active: view.isActive,
  plans: (view.plans ?? []).map(toPlan),
});

const toSaveResult = (view: ApiPlan): PlanSaveResult => ({
  plan: toPlan(view),
  warning: view.warning ?? null,
});

const catalogPath = (rest: string) => `/api/admin/catalog${rest}`;

/** `GET /admin/catalog`: servicios con todos sus planes, activos e inactivos (RF-009-04). */
export async function listAdminCatalog(): Promise<AdminCatalogService[]> {
  const views = await apiRequest<ApiService[]>(catalogPath(''));
  return views.map(toService);
}

/** `POST /admin/catalog/services` (CA-009-02, CA-009-03). */
export async function createCatalogService(input: ServiceInput): Promise<AdminCatalogService> {
  const view = await apiRequest<ApiService>(catalogPath('/services'), {
    method: 'POST',
    body: input,
  });
  return toService(view);
}

/** `PATCH /admin/catalog/services/:id`. El slug es la clave pública y el servidor no lo cambia. */
export async function updateCatalogService(
  id: string,
  input: ServiceInput,
): Promise<AdminCatalogService> {
  const view = await apiRequest<ApiService>(catalogPath(`/services/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: input,
  });
  return toService(view);
}

/** `POST /admin/catalog/services/:id/activate|deactivate`. */
export async function setCatalogServiceActive(
  id: string,
  active: boolean,
): Promise<AdminCatalogService> {
  const action = active ? 'activate' : 'deactivate';
  const view = await apiRequest<ApiService>(
    catalogPath(`/services/${encodeURIComponent(id)}/${action}`),
    { method: 'POST' },
  );
  return toService(view);
}

/**
 * `POST /admin/catalog/plans` (CA-009-02). El backend recibe el servicio en el cuerpo
 * (`serviceId`), no en la ruta.
 */
export async function createCatalogPlan(
  serviceId: string,
  input: PlanInput,
): Promise<PlanSaveResult> {
  const view = await apiRequest<ApiPlan>(catalogPath('/plans'), {
    method: 'POST',
    body: { serviceId, ...input },
  });
  return toSaveResult(view);
}

/** `PATCH /admin/catalog/plans/:id` (RF-009-05, CA-009-04). */
export async function updateCatalogPlan(id: string, input: PlanInput): Promise<PlanSaveResult> {
  const view = await apiRequest<ApiPlan>(catalogPath(`/plans/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: input,
  });
  return toSaveResult(view);
}

/** `POST /admin/catalog/plans/:id/activate|deactivate` (CA-009-05). */
export async function setCatalogPlanActive(id: string, active: boolean): Promise<AdminCatalogPlan> {
  const action = active ? 'activate' : 'deactivate';
  const view = await apiRequest<ApiPlan>(
    catalogPath(`/plans/${encodeURIComponent(id)}/${action}`),
    {
      method: 'POST',
    },
  );
  return toPlan(view);
}

/** `POST /admin/catalog/import/preview`: valida el archivo y devuelve cambios y errores por fila. */
export function previewCatalogImport(
  format: CatalogImportFormat,
  content: string,
): Promise<CatalogImportPreview> {
  return apiRequest<CatalogImportPreview>(catalogPath('/import/preview'), {
    method: 'POST',
    body: { format, content },
  });
}

/** `POST /admin/catalog/import/apply`: aplica la vista previa validada, todo o nada (CA-009-06). */
export function applyCatalogImport(token: string): Promise<CatalogImportApplied> {
  return apiRequest<CatalogImportApplied>(catalogPath('/import/apply'), {
    method: 'POST',
    body: { token },
  });
}
