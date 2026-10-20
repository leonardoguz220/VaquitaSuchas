// Normalización de las entradas del log de auditoría (spec 009, data-model `admin_audit_log`).
// Pura: la restricción CHECK de la base es la última defensa; aquí se rechaza antes y se limpian
// los metadatos para que nunca guarden datos sensibles (RNF-009-03).

export const ADMIN_AUDIT_ACTIONS = [
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
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

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

// La spec 010 define el puerto con nombres punteados; el log guarda los del modelo de la 009.
const ACTION_ALIASES: Readonly<Record<string, AdminAuditAction>> = {
  'dispute.evidence.open': 'reclamo_abrir_evidencia',
  'dispute.resolve': 'reclamo_resolver',
};
const TARGET_ALIASES: Readonly<Record<string, AuditTargetType>> = {
  dispute: 'join_dispute',
};

export function normalizeAction(action: string): AdminAuditAction | null {
  const alias = ACTION_ALIASES[action];
  if (alias) return alias;
  return (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(action)
    ? (action as AdminAuditAction)
    : null;
}

export function normalizeTargetType(targetType: string): AuditTargetType | null {
  const alias = TARGET_ALIASES[targetType];
  if (alias) return alias;
  return (AUDIT_TARGET_TYPES as readonly string[]).includes(targetType)
    ? (targetType as AuditTargetType)
    : null;
}

const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'contrasena',
  'secret',
  'token',
  'hash',
  'cedula',
  'apikey',
  'authorization',
  'cookie',
  'message',
  'mensaje',
  'comprobante',
  'receipt',
  'cipher',
  'encrypted',
];
const SENSITIVE_EXACT = new Set([
  'ci',
  'ciplain',
  'email',
  'correo',
  'phone',
  'telefono',
  'celular',
]);
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return SENSITIVE_EXACT.has(normalized) || SENSITIVE_FRAGMENTS.some((f) => normalized.includes(f));
}

function clean(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      const cleaned = clean(inner, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

/**
 * Lista blanca de claves de `metadata` por acción (RNF-009-03): solo ids, estados y conteos; nada
 * de texto libre (el motivo va en la columna `reason`). Lo no declarado se descarta. Toda acción
 * del CHECK de 0092 debe tener su tabla: la prueba unitaria lo comprueba.
 */
export const AUDIT_METADATA_KEYS: Readonly<Record<AdminAuditAction, readonly string[]>> = {
  catalogo_crear: ['serviceId', 'planId'],
  catalogo_editar: ['serviceId', 'planId', 'changedFields'],
  catalogo_activar: ['serviceId', 'planId'],
  catalogo_desactivar: ['serviceId', 'planId'],
  catalogo_importar: ['created', 'updated', 'errors'],
  usuario_suspender: ['previousStatus'],
  usuario_reactivar: ['previousStatus'],
  usuario_banear: ['banId', 'disputeId', 'effects'],
  baneo_revertir: ['userId', 'previousStatus'],
  rol_promover: ['fromRole', 'toRole'],
  rol_quitar: ['fromRole', 'toRole'],
  titular_habilitar: ['enablementId'],
  titular_quitar_habilitacion: ['enablementId'],
  reclamo_abrir_evidencia: ['disputeId', 'requestId'],
  reclamo_resolver: ['disputeId', 'requestId', 'outcome', 'banId'],
  publicacion_restaurar: ['listingId'],
  publicacion_eliminar: ['listingId'],
  publicacion_eliminar_y_suspender: ['listingId', 'userId'],
  titularidad_transferir: ['groupId', 'fromUserId', 'toUserId'],
};

/**
 * Deja solo las claves declaradas para la acción y, sobre ellas, quita las sensibles (segunda red).
 * Una acción sin tabla es un error de programación y lanza.
 */
export function sanitizeMetadata(
  action: AdminAuditAction,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const allowed = AUDIT_METADATA_KEYS[action] as readonly string[] | undefined;
  if (!allowed)
    throw new Error(`La acción de auditoría "${action}" no declara claves de metadata.`);
  if (!metadata) return {};
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.hasOwn(metadata, key)) picked[key] = metadata[key];
  }
  return clean(picked, 0) as Record<string, unknown>;
}
