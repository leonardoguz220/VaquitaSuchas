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
} as const;

export function removeMemberErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return MEMBER_MESSAGES.connection;
  const rule = typeof error.details?.rule === 'string' ? error.details.rule : '';
  if (error.code === 'GROUP_CLOSED' || rule === 'RN-001-07') return MEMBER_MESSAGES.closed;
  if (error.code === 'GROUP_FROZEN' || rule.startsWith('RN-009-')) return MEMBER_MESSAGES.frozen;
  if (error.statusCode === 403) return MEMBER_MESSAGES.forbidden;
  if (error.statusCode === 404) return MEMBER_MESSAGES.notMember;
  return MEMBER_MESSAGES.unexpected;
}
