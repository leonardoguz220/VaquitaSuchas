// Reglas puras de administración (plan §5): sin NestJS ni `pg`. El servicio traduce el resultado
// al error HTTP del contrato (contracts/api.md, «Errores propios de la spec»).

export type AccountStatus = 'activo' | 'suspendido' | 'baneado';
export type AccountRole = 'usuario' | 'admin';

export interface AdminUserRef {
  id: string;
  role: AccountRole;
  status: AccountStatus;
}

export type AdminAction = 'suspend' | 'reactivate' | 'ban' | 'remove_role';

export type RuleFailure =
  | { ok: false; code: 'ADMIN_TARGET_FORBIDDEN'; rule: 'RN-009-02' | 'RN-009-07' }
  | { ok: false; code: 'USER_BANNED'; rule: 'RF-009-19' }
  | { ok: false; code: 'LAST_ADMIN'; rule: 'RN-009-01' }
  | { ok: false; code: 'SAME_ADMIN'; rule: 'RF-009-23' }
  // 409 INVALID_TRANSITION: el estado actual no admite la acción.
  | { ok: false; code: 'INVALID_TRANSITION'; rule: 'RN-009-03' }
  // 409: el baneo ya estaba revertido.
  | { ok: false; code: 'ALREADY_REVOKED'; rule: 'RF-009-23' };

export type RuleResult = { ok: true } | RuleFailure;

const OK: RuleResult = { ok: true };

/**
 * Nadie se suspende, banea ni quita el rol a sí mismo; no se suspende ni banea a un
 * administrador (RN-009-02, RN-009-07); reactivar no aplica a un baneado (CA-009-24).
 */
export function canActOnUser(input: {
  actor: AdminUserRef;
  target: AdminUserRef;
  action: AdminAction;
}): RuleResult {
  const { actor, target, action } = input;
  const rule = action === 'ban' ? 'RN-009-07' : 'RN-009-02';

  if (action === 'suspend' || action === 'ban' || action === 'remove_role') {
    if (actor.id === target.id) return { ok: false, code: 'ADMIN_TARGET_FORBIDDEN', rule };
  }
  if ((action === 'suspend' || action === 'ban') && target.role === 'admin') {
    return { ok: false, code: 'ADMIN_TARGET_FORBIDDEN', rule };
  }

  switch (action) {
    case 'suspend':
      return target.status === 'activo'
        ? OK
        : { ok: false, code: 'INVALID_TRANSITION', rule: 'RN-009-03' };
    case 'ban':
      return target.status === 'baneado'
        ? { ok: false, code: 'INVALID_TRANSITION', rule: 'RN-009-03' }
        : OK;
    case 'reactivate':
      if (target.status === 'baneado') return { ok: false, code: 'USER_BANNED', rule: 'RF-009-19' };
      return target.status === 'suspendido'
        ? OK
        : { ok: false, code: 'INVALID_TRANSITION', rule: 'RN-009-03' };
    case 'remove_role':
      return OK;
  }
}

/**
 * Falla si quitar el rol deja cero administradores activos (RN-009-01). `activeAdmins` es el
 * número de administradores activos ANTES del cambio, incluido el objetivo si lo es.
 */
export function canRemoveAdminRole(input: {
  activeAdmins: number;
  target: AdminUserRef;
}): RuleResult {
  const { activeAdmins, target } = input;
  const isActiveAdmin = target.role === 'admin' && target.status === 'activo';
  if (isActiveAdmin && activeAdmins <= 1) {
    return { ok: false, code: 'LAST_ADMIN', rule: 'RN-009-01' };
  }
  return OK;
}

/** Solo otro administrador distinto del que baneó puede revertir, y una sola vez (RF-009-23). */
export function canRevokeBan(input: {
  ban: { bannedBy: string; revokedAt: Date | null };
  actorId: string;
}): RuleResult {
  if (input.ban.revokedAt !== null) {
    return { ok: false, code: 'ALREADY_REVOKED', rule: 'RF-009-23' };
  }
  if (input.ban.bannedBy === input.actorId) {
    return { ok: false, code: 'SAME_ADMIN', rule: 'RF-009-23' };
  }
  return OK;
}
