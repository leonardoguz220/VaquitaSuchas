/**
 * Cliente del log de auditoría (spec 009, `contracts/api.md` § Auditoría; RF-009-18). Solo hay
 * lectura: no existen `PUT`, `PATCH` ni `DELETE` sobre el log (CA-009-19, RNF-009-05).
 */
import { apiRequest } from './http';

/** Acciones de `admin_audit_log.action` (`data-model.md`). */
export type AuditAction =
  | 'catalogo_crear'
  | 'catalogo_editar'
  | 'catalogo_activar'
  | 'catalogo_desactivar'
  | 'catalogo_importar'
  | 'usuario_suspender'
  | 'usuario_reactivar'
  | 'usuario_banear'
  | 'baneo_revertir'
  | 'rol_promover'
  | 'rol_quitar'
  | 'titular_habilitar'
  | 'titular_quitar_habilitacion'
  | 'reclamo_abrir_evidencia'
  | 'reclamo_resolver'
  | 'publicacion_restaurar'
  | 'publicacion_eliminar'
  | 'publicacion_eliminar_y_suspender'
  | 'titularidad_transferir';

/** Objetivos de `admin_audit_log.target_type` (`data-model.md`). */
export type AuditTargetType =
  'user' | 'group' | 'catalog_service' | 'catalog_plan' | 'join_dispute' | 'listing' | 'ban';

/**
 * Entrada del log. [NECESITA ACLARACIÓN] El contrato nombra `AuditEntry` sin campos; se toman las
 * columnas de `admin_audit_log` con el nombre del administrador y un `targetLabel` legible
 * opcional (por ejemplo, el nombre del usuario). `metadata` no se muestra.
 */
export interface AuditEntry {
  id: string;
  admin: { id: string; fullName: string };
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  targetLabel?: string | null;
  reason: string | null;
  /** ISO 8601 en UTC. */
  occurredAt: string;
}

export interface AuditLogPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

export interface ListAuditLogParams {
  adminId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  /**
   * Día en La Paz (`YYYY-MM-DD`). [NECESITA ACLARACIÓN] El contrato no fija el formato de
   * `from` y `to`; se envía el día tal cual lo elige la persona.
   */
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

/** `GET /admin/audit-log` (RF-009-18; CA-009-18, CA-009-19) con filtros y paginación. */
export function listAuditLog(params: ListAuditLogParams = {}): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  const keys = ['adminId', 'action', 'targetType', 'targetId', 'from', 'to'] as const;
  for (const key of keys) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<AuditLogPage>(`/api/admin/audit-log${search ? `?${search}` : ''}`);
}
