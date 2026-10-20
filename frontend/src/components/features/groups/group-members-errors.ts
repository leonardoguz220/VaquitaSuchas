/**
 * Mensajes de quitar miembros y de abandonar el grupo (T029, T031), elegidos por `code` y
 * `details.rule`, nunca por `message` (contrato 001: `DELETE …/members/:userId` y `POST …/leave`).
 */
import { isConnectionError, type ApiError } from '@/services/http';

export const MEMBER_MESSAGES = {
  connection: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.',
  forbidden: 'Solo el titular puede quitar miembros.',
  notMember: 'Esta persona ya no es miembro del grupo.',
  closed: 'El grupo está cerrado: ya no se pueden quitar miembros.',
  frozen: 'El grupo está en solo lectura porque el titular fue baneado.',
  unexpected: 'No pudimos quitar a esta persona. Inténtalo de nuevo.',
  owner: 'El titular no puede abandonar el grupo. Transfiere la titularidad o ciérralo.',
  leaveUnexpected: 'No pudimos completar tu salida del grupo. Inténtalo de nuevo.',
} as const;

function openChargesMessage(count: number | null): string {
  const tail = 'Págalos o pide al titular que los cancele antes de abandonar.';
  if (count === null) return `Tienes cobros sin pagar. ${tail}`;
  const noun = count === 1 ? 'cobro sin pagar' : 'cobros sin pagar';
  return `Tienes ${count} ${noun} (pendientes, en revisión o atrasados). ${tail}`;
}

/** Mensaje de `POST /groups/:id/leave` (RF-001-16, CA-001-14): el cobro abierto se lee de `details`. */
export function leaveErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return MEMBER_MESSAGES.connection;
  const rule = typeof error.details?.rule === 'string' ? error.details.rule : '';
  const openCharges = error.details?.openCharges;
  if (error.code === 'HAS_OPEN_CHARGES' || rule === 'RF-001-16') {
    return openChargesMessage(typeof openCharges === 'number' ? openCharges : null);
  }
  if (rule === 'RN-001-08') return MEMBER_MESSAGES.owner;
  if (error.code === 'GROUP_CLOSED' || rule === 'RN-001-07') return MEMBER_MESSAGES.closed;
  if (error.code === 'GROUP_FROZEN' || rule.startsWith('RN-009-')) return MEMBER_MESSAGES.frozen;
  if (error.statusCode === 404) return MEMBER_MESSAGES.notMember;
  return MEMBER_MESSAGES.leaveUnexpected;
}

export function removeMemberErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return MEMBER_MESSAGES.connection;
  const rule = typeof error.details?.rule === 'string' ? error.details.rule : '';
  if (error.code === 'GROUP_CLOSED' || rule === 'RN-001-07') return MEMBER_MESSAGES.closed;
  if (error.code === 'GROUP_FROZEN' || rule.startsWith('RN-009-')) return MEMBER_MESSAGES.frozen;
  if (error.statusCode === 403) return MEMBER_MESSAGES.forbidden;
  if (error.statusCode === 404) return MEMBER_MESSAGES.notMember;
  return MEMBER_MESSAGES.unexpected;
}
