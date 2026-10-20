/**
 * Datos simulados del log de auditoría (spec 009, RF-009-18) mientras el backend no lo entrega.
 * Nombres inventados; las entradas vienen ya ordenadas como las daría la API.
 */
import type {
  AuditAction,
  AuditEntry,
  AuditLogPage,
  AuditTargetType,
  ListAuditLogParams,
} from './admin-audit';

const LATENCY_MS = 350;
const DEFAULT_LIMIT = 20;
const LA_PAZ_OFFSET_MS = 4 * 3600 * 1000;

const ADMINS = ['Administradora Demo', 'Administrador Demo'];

/** Acción, tipo de objeto y motivo de cada entrada; de la más reciente a la más antigua. */
const SEED: { action: AuditAction; targetType: AuditTargetType; reason: string | null }[] = [
  {
    action: 'reclamo_resolver',
    targetType: 'join_dispute',
    reason: 'Pago confirmado con el comprobante.',
  },
  { action: 'reclamo_abrir_evidencia', targetType: 'join_dispute', reason: null },
  {
    action: 'usuario_banear',
    targetType: 'user',
    reason: 'Cobros falsos reportados por tres grupos.',
  },
  { action: 'catalogo_editar', targetType: 'catalog_plan', reason: null },
  { action: 'catalogo_crear', targetType: 'catalog_service', reason: null },
  {
    action: 'titular_habilitar',
    targetType: 'user',
    reason: 'Calificación alta y historial limpio.',
  },
  {
    action: 'usuario_suspender',
    targetType: 'user',
    reason: 'Cuenta en revisión por reclamos abiertos.',
  },
  { action: 'usuario_reactivar', targetType: 'user', reason: 'Revisión terminada sin falta.' },
  {
    action: 'publicacion_eliminar',
    targetType: 'listing',
    reason: 'Cupo publicado con datos falsos.',
  },
  {
    action: 'publicacion_restaurar',
    targetType: 'listing',
    reason: 'Reporte rechazado al revisarlo.',
  },
  { action: 'catalogo_importar', targetType: 'catalog_service', reason: null },
  { action: 'rol_promover', targetType: 'user', reason: 'Apoyo en la moderación de reclamos.' },
  { action: 'titularidad_transferir', targetType: 'group', reason: 'El titular dejó el grupo.' },
  { action: 'catalogo_desactivar', targetType: 'catalog_plan', reason: null },
  { action: 'baneo_revertir', targetType: 'ban', reason: 'Baneo levantado tras apelación.' },
  { action: 'reclamo_abrir_evidencia', targetType: 'join_dispute', reason: null },
  {
    action: 'titular_quitar_habilitacion',
    targetType: 'user',
    reason: 'Habilitación vencida sin renovar.',
  },
  {
    action: 'publicacion_eliminar_y_suspender',
    targetType: 'listing',
    reason: 'Estafa confirmada en el cupo.',
  },
  { action: 'usuario_suspender', targetType: 'user', reason: 'Pago pendiente por más de 30 días.' },
  { action: 'catalogo_activar', targetType: 'catalog_service', reason: null },
  { action: 'rol_quitar', targetType: 'user', reason: 'Ya no requiere acceso de administración.' },
  {
    action: 'reclamo_resolver',
    targetType: 'join_dispute',
    reason: 'Sin falta: el cobro sí llegó.',
  },
  { action: 'usuario_reactivar', targetType: 'user', reason: 'Cuenta revisada y sin incidencias.' },
  { action: 'catalogo_crear', targetType: 'catalog_plan', reason: null },
];

function seedEntries(): AuditEntry[] {
  return SEED.map((row, index) => ({
    id: `aud-${String(index + 1).padStart(3, '0')}`,
    adminName: ADMINS[index % ADMINS.length],
    action: row.action,
    targetType: row.targetType,
    targetId: `obj-${100 + index}`,
    reason: row.reason,
    // Una entrada cada seis horas, desde la más reciente hacia atrás.
    occurredAt: new Date(Date.UTC(2026, 9, 19, 14) - index * 6 * 3600 * 1000).toISOString(),
  }));
}

let entries = seedEntries();

/** Vuelve a los datos de ejemplo (para pruebas). */
export function resetAuditMock(): void {
  entries = seedEntries();
}

/** Día `AAAA-MM-DD` en hora de La Paz, para filtrar por rango. */
function dayOf(iso: string): string {
  return new Date(new Date(iso).getTime() - LA_PAZ_OFFSET_MS).toISOString().slice(0, 10);
}

function matches(entry: AuditEntry, params: ListAuditLogParams): boolean {
  if (params.action && entry.action !== params.action) return false;
  if (params.targetType && entry.targetType !== params.targetType) return false;
  const day = dayOf(entry.occurredAt);
  if (params.from && day < params.from) return false;
  if (params.to && day > params.to) return false;
  return true;
}

export function listAuditLog(params: ListAuditLogParams): Promise<AuditLogPage> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const limit = params.limit ?? DEFAULT_LIMIT;
      const rows = entries.filter((entry) => matches(entry, params));
      const start = params.cursor ? Number(params.cursor) : 0;
      const items = rows.slice(start, start + limit);
      const nextCursor = start + limit < rows.length ? String(start + limit) : null;
      resolve({ items, nextCursor });
    }, LATENCY_MS);
  });
}
