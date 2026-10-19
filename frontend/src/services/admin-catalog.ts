/**
 * Cliente de la escritura del catálogo por un administrador (spec 009, `contracts/api.md`
 * § Catálogo; RF-009-04 a RF-009-07). Todos exigen `AdminGuard`. La lectura usa los endpoints
 * de la spec 004 (`services/catalog.ts`). Las validaciones reales (`slug` único, cupos de 2 a 20,
 * montos positivos) las hace el backend.
 *
 * [NECESITA ACLARACIÓN] La spec 004 registra las rutas con `:slug` y planes anidados
 * (`POST /admin/catalog/services/:slug/plans`, `PATCH /admin/catalog/plans/:slug`); la spec 009
 * las define con `:id` y «lo mismo para `/admin/catalog/plans`». Se sigue la spec 009.
 */
import type { CatalogCategory, CatalogCurrency, CatalogPlan, CatalogService } from './catalog';
import { apiRequest } from './http';

/** Respuesta de una escritura: el objeto y, al tocar precios o cupos, el aviso de RF-009-05. */
export type CatalogWriteResult<T> = T & { warning?: string | null };

export interface CatalogServiceInput {
  slug: string;
  name: string;
  category: CatalogCategory;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface CatalogPlanInput {
  serviceId: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: CatalogCurrency;
  maxSlots: number;
  individualPriceCents: number | null;
  /** `YYYY-MM-DD`. */
  verifiedOn: string | null;
}

/** Cambio de la vista previa de una importación. [NECESITA ACLARACIÓN] Forma no detallada. */
export interface CatalogImportChange {
  row: number;
  entity: 'servicio' | 'plan';
  action: 'crear' | 'actualizar' | 'sin_cambios';
  slug: string;
  name?: string | null;
}

export interface CatalogImportError {
  row: number;
  field: string;
  message: string;
}

/** `POST /admin/catalog/import/preview` → `{ token, changes, errors }` (RF-009-06). */
export interface CatalogImportPreview {
  token: string;
  changes: CatalogImportChange[];
  errors: CatalogImportError[];
}

const BASE = '/api/admin/catalog';

function servicePath(serviceId: string): string {
  return `${BASE}/services/${encodeURIComponent(serviceId)}`;
}

function planPath(planId: string): string {
  return `${BASE}/plans/${encodeURIComponent(planId)}`;
}

/** `POST /admin/catalog/services` (CA-009-02). `409 CONFLICT` con un `slug` repetido (CA-009-03). */
export function createCatalogService(
  input: CatalogServiceInput,
): Promise<CatalogWriteResult<CatalogService>> {
  return apiRequest<CatalogWriteResult<CatalogService>>(`${BASE}/services`, {
    method: 'POST',
    body: input,
  });
}

/** `PATCH /admin/catalog/services/:id` (RF-009-04). */
export function updateCatalogService(
  serviceId: string,
  input: Partial<CatalogServiceInput>,
): Promise<CatalogWriteResult<CatalogService>> {
  return apiRequest<CatalogWriteResult<CatalogService>>(servicePath(serviceId), {
    method: 'PATCH',
    body: input,
  });
}

/** `POST /admin/catalog/services/:id/activate|deactivate` (RF-009-04): sin borrado físico. */
export function setCatalogServiceActive(serviceId: string, active: boolean): Promise<unknown> {
  return apiRequest<unknown>(`${servicePath(serviceId)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  });
}

/** `POST /admin/catalog/plans` (CA-009-02): cupos de 2 a 20 y montos positivos (RF-009-07). */
export function createCatalogPlan(
  input: CatalogPlanInput,
): Promise<CatalogWriteResult<CatalogPlan>> {
  return apiRequest<CatalogWriteResult<CatalogPlan>>(`${BASE}/plans`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `PATCH /admin/catalog/plans/:id` (CA-009-04): cambiar precio o cupos no afecta suscripciones
 * existentes; la respuesta trae `warning` (RF-009-05).
 */
export function updateCatalogPlan(
  planId: string,
  input: Partial<Omit<CatalogPlanInput, 'serviceId'>>,
): Promise<CatalogWriteResult<CatalogPlan>> {
  return apiRequest<CatalogWriteResult<CatalogPlan>>(planPath(planId), {
    method: 'PATCH',
    body: input,
  });
}

/** `POST /admin/catalog/plans/:id/activate|deactivate` (CA-009-05). */
export function setCatalogPlanActive(planId: string, active: boolean): Promise<unknown> {
  return apiRequest<unknown>(`${planPath(planId)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  });
}

/**
 * `POST /admin/catalog/import/preview` con el archivo CSV o JSON (`multipart/form-data`, campo
 * `file`). No cambia nada: devuelve un `token` de 15 minutos, los cambios y los errores por fila.
 */
export function previewCatalogImport(file: File): Promise<CatalogImportPreview> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<CatalogImportPreview>(`${BASE}/import/preview`, {
    method: 'POST',
    formData: form,
  });
}

/** `POST /admin/catalog/import/apply` `{ token }`: todo o nada (CA-009-06). */
export function applyCatalogImport(token: string): Promise<unknown> {
  return apiRequest<unknown>(`${BASE}/import/apply`, { method: 'POST', body: { token } });
}
