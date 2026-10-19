import type { ChargeStatus } from './charge-state.js';

export type ChargeAccess = 'titular' | 'dueno' | 'dueno_retirado' | 'miembro' | 'ninguno';
export type GroupState = 'activo' | 'cerrado' | 'congelado';
export type AllowedAction = 'uploadReceipt' | 'confirm' | 'reject' | 'manualPayment' | 'cancel';

export interface AccessInput {
  user: { id: string };
  charge: { userId: string; status: ChargeStatus };
  group: { ownerId: string };
  /** Fila de membresía de `user` en el grupo; null si nunca fue miembro. */
  membership: { active: boolean } | null;
}

/** Tabla de acceso del contrato (CA-002-12, CA-002-13, CA-002-23, CA-002-32). */
export function resolveAccess({ user, charge, group, membership }: AccessInput): ChargeAccess {
  if (user.id === group.ownerId) return 'titular';
  const isOwnerOfCharge = charge.userId === user.id;
  if (isOwnerOfCharge && membership?.active) return 'dueno';
  if (isOwnerOfCharge && (charge.status === 'atrasado' || charge.status === 'en_revision')) {
    return 'dueno_retirado'; // RN-002-11: puede pagar su deuda, pero no ve nada más del grupo
  }
  if (membership?.active) return 'miembro';
  return 'ninguno';
}

/**
 * Acciones que ve quien consulta (el frontend no decide). Grupo congelado: ninguna (solo lectura).
 * Grupo cerrado: se siguen saldando los cobros existentes.
 */
export function allowedActions(
  access: ChargeAccess,
  status: ChargeStatus,
  groupState: GroupState,
): AllowedAction[] {
  if (groupState === 'congelado') return [];
  const open = status === 'pendiente' || status === 'atrasado';
  if (access === 'titular') {
    if (status === 'en_revision') return ['confirm', 'reject'];
    return open ? ['manualPayment', 'cancel'] : [];
  }
  if (access === 'dueno' || access === 'dueno_retirado') return open ? ['uploadReceipt'] : [];
  return [];
}
