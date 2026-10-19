import type { AuditAction, AuditTargetType } from '@/services/admin-audit';

/** Rótulos en español de cada acción del log (RF-009-18). */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  catalogo_crear: 'Catálogo: crear',
  catalogo_editar: 'Catálogo: editar',
  catalogo_activar: 'Catálogo: activar',
  catalogo_desactivar: 'Catálogo: desactivar',
  catalogo_importar: 'Catálogo: importar',
  usuario_suspender: 'Suspender usuario',
  usuario_reactivar: 'Reactivar usuario',
  usuario_banear: 'Banear usuario',
  baneo_revertir: 'Revertir baneo',
  rol_promover: 'Promover a administrador',
  rol_quitar: 'Quitar rol de administrador',
  titular_habilitar: 'Habilitar titular',
  titular_quitar_habilitacion: 'Quitar habilitación de titular',
  reclamo_abrir_evidencia: 'Abrir evidencia de reclamo',
  reclamo_resolver: 'Resolver reclamo',
  publicacion_restaurar: 'Restaurar publicación',
  publicacion_eliminar: 'Eliminar publicación',
  publicacion_eliminar_y_suspender: 'Eliminar publicación y suspender',
  titularidad_transferir: 'Transferir titularidad',
};

/** Rótulos del tipo de objeto sobre el que actuó la acción. */
export const AUDIT_TARGET_LABEL: Record<AuditTargetType, string> = {
  user: 'Usuario',
  group: 'Grupo',
  catalog_service: 'Servicio',
  catalog_plan: 'Plan',
  join_dispute: 'Reclamo',
  listing: 'Publicación',
  ban: 'Baneo',
};
