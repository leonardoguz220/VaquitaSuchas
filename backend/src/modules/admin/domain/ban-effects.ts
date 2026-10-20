// Efectos de un baneo sobre otros módulos (plan §5, RF-009-19, RF-009-22). Función pura: describe
// qué hay que hacer; los manejadores de `subscriptions` y `join-requests` lo aplican en la misma
// transacción. Sirve para probar el baneo sin base de datos.

export interface BannedUserRef {
  id: string;
}

export interface GroupRef {
  groupId: string;
}

export type BanEffect =
  /** Congelar un grupo del baneado (`frozen_reason = 'titular_baneado'`). */
  | { kind: 'freeze_group'; groupId: string; frozenReason: 'titular_baneado' }
  /** Rechazar las solicitudes activas de un grupo que pierde a su titular. */
  | { kind: 'reject_group_requests'; groupId: string; reason: 'titular_baneado' }
  /** Retirar al baneado de un grupo donde es miembro. */
  | { kind: 'remove_member'; groupId: string; reason: 'baneo' }
  /** Cancelar las solicitudes que el baneado abrió. */
  | { kind: 'cancel_own_requests'; userId: string };

export function banEffects(
  user: BannedUserRef,
  groupsAsOwner: readonly GroupRef[],
  groupsAsMember: readonly GroupRef[],
): BanEffect[] {
  const owned = new Set(groupsAsOwner.map((g) => g.groupId));
  const effects: BanEffect[] = [];

  for (const groupId of owned) {
    effects.push({ kind: 'freeze_group', groupId, frozenReason: 'titular_baneado' });
    effects.push({ kind: 'reject_group_requests', groupId, reason: 'titular_baneado' });
  }
  const removed = new Set<string>();
  for (const { groupId } of groupsAsMember) {
    if (owned.has(groupId) || removed.has(groupId)) continue;
    removed.add(groupId);
    effects.push({ kind: 'remove_member', groupId, reason: 'baneo' });
  }
  effects.push({ kind: 'cancel_own_requests', userId: user.id });
  return effects;
}
