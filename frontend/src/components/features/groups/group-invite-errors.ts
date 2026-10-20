/**
 * Mensajes de error del panel del titular (T025), elegidos por `code` y `details.rule`, nunca por
 * `message` (contrato 001: `PATCH /groups/:id` y `POST /groups/:id/invite-code/regenerate`).
 */
import { isConnectionError, type ApiError } from '@/services/http';

export const INVITE_PANEL_MESSAGES = {
  connection: 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.',
  forbidden: 'Solo el titular puede cambiar el código de invitación o la recepción de miembros.',
  closed: 'El grupo está cerrado: ya no se puede cambiar el código ni recibir miembros.',
  frozen: 'El grupo está en solo lectura porque el titular fue baneado.',
  stale: 'Otra persona modificó el grupo; recargamos los datos.',
  notFound: 'Este grupo ya no existe o no eres parte de él.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
} as const;

export function isStaleState(error: ApiError): boolean {
  return error.statusCode === 409 || error.code === 'STALE_STATE';
}

export function invitePanelErrorMessage(error: ApiError): string {
  if (isConnectionError(error)) return INVITE_PANEL_MESSAGES.connection;
  if (isStaleState(error)) return INVITE_PANEL_MESSAGES.stale;
  const rule = typeof error.details?.rule === 'string' ? error.details.rule : '';
  if (error.code === 'GROUP_CLOSED' || rule === 'RN-001-07') return INVITE_PANEL_MESSAGES.closed;
  if (error.code === 'GROUP_FROZEN' || rule.startsWith('RN-009-')) {
    return INVITE_PANEL_MESSAGES.frozen;
  }
  if (error.statusCode === 403) return INVITE_PANEL_MESSAGES.forbidden;
  if (error.statusCode === 404) return INVITE_PANEL_MESSAGES.notFound;
  return INVITE_PANEL_MESSAGES.unexpected;
}
