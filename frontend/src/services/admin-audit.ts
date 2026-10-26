/**
 * Cliente del log de auditoría (spec 009, `contracts/api.md`, Auditoría: `GET /admin/audit-log`).
 * Solo lectura: el contrato no tiene `PUT`, `PATCH` ni `DELETE` sobre el log (CA-009-19).
 *
 * Conectado a `GET /admin/audit-log` (spec 009 T025). La API entrega `adminId` y no el nombre del
 * administrador: la pantalla muestra el identificador. Mejora futura para backend: resolver el nombre.
 */
import { apiRequest } from './http';

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
  /** Administrador que hizo la acción (la API no envía su nombre). */
  adminId: string;
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

/** Filtros de `GET /admin/audit-log`. Las fechas van como `AAAA-MM-DD` (día en La Paz). */
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

const LA_PAZ_OFFSET = '-04:00';

/** El backend exige ISO 8601: el día `from` empieza y el día `to` termina en hora de La Paz. */
const startOfDay = (day: string) => `${day}T00:00:00${LA_PAZ_OFFSET}`;
const endOfDay = (day: string) => `${day}T23:59:59.999${LA_PAZ_OFFSET}`;

/** `GET /admin/audit-log` (RF-009-18, CA-009-18). Va de la entrada más reciente a la más antigua. */
export function listAuditLog(params: ListAuditLogParams = {}): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  if (params.adminId) query.set('adminId', params.adminId);
  if (params.action) query.set('action', params.action);
  if (params.targetType) query.set('targetType', params.targetType);
  if (params.targetId) query.set('targetId', params.targetId);
  if (params.from) query.set('from', startOfDay(params.from));
  if (params.to) query.set('to', endOfDay(params.to));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<AuditLogPage>(`/api/admin/audit-log${suffix}`);
}
