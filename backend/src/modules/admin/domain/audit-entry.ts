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

/** Quita las claves sensibles (CI, contraseñas, tokens, chats, comprobantes, contacto). */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  return clean(metadata, 0) as Record<string, unknown>;
}
