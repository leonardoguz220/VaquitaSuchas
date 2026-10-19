/**
 * Cliente del log de auditoría (spec 009, `contracts/api.md`, Auditoría: `GET /admin/audit-log`).
 * Solo lectura: el contrato no tiene `PUT`, `PATCH` ni `DELETE` sobre el log (CA-009-19).
 * Por ahora responde con datos simulados de `admin-audit.mock.ts`; al conectar el backend solo
 * cambia el cuerpo de `listAuditLog` por `apiRequest`.
 *
 * Pendiente de confirmar con backend: el contrato no define la forma de `AuditEntry`. Se toma de
 * las columnas de `admin_audit_log` (data-model.md), con `adminName` ya resuelto para mostrarlo.
 */
import * as mock from './admin-audit.mock';

/** Acciones que admite `admin_audit_log.action` (data-model.md, spec 009). */
export const AUDIT_ACTIONS = [
  'catalogo_crear',
  'catalogo_editar',
  'catalogo_activar',
  'catalogo_desactivar',
  'catalogo_importar',
  'usuario_suspender',
  'usuario_reactivar',
  'usuario_banear',
  'baneo_revertir',
  'rol_promover',
  'rol_quitar',
  'titular_habilitar',
  'titular_quitar_habilitacion',
  'reclamo_abrir_evidencia',
  'reclamo_resolver',
  'publicacion_restaurar',
  'publicacion_eliminar',
  'publicacion_eliminar_y_suspender',
  'titularidad_transferir',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Tipos de objeto que admite `admin_audit_log.target_type`. */
export const AUDIT_TARGET_TYPES = [
  'user',
  'group',
  'catalog_service',
  'catalog_plan',
  'join_dispute',
  'listing',
  'ban',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Una entrada del log (`AuditEntry`). Solo anexado: nunca cambia después de escribirse. */
export interface AuditEntry {
  id: string;
  adminName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  /** Motivo (10 a 300 caracteres) cuando la acción lo exige; `null` si no hay. */
  reason: string | null;
  /** ISO 8601 en UTC. */
  occurredAt: string;
}

export interface AuditLogPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

/** Filtros de `GET /admin/audit-log`. Las fechas van como `AAAA-MM-DD` (a confirmar con backend). */
export interface ListAuditLogParams {
  /** Administrador que hizo la acción (contrato 009: `adminId`). La pantalla aún no lo ofrece. */
  adminId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  /** Objeto sobre el que actuó la acción (contrato 009: `targetId`). */
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

/** `GET /admin/audit-log` (RF-009-18, CA-009-18). Va de la entrada más reciente a la más antigua. */
export function listAuditLog(params: ListAuditLogParams = {}): Promise<AuditLogPage> {
  return mock.listAuditLog(params);
}
