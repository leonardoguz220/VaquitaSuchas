/**
 * Cliente de invitaciones y enlaces de WhatsApp (spec 005, `contracts/api.md`, parte B). Una
 * función por endpoint. Por ahora cada función responde con datos simulados de
 * `invitations.mock.ts` (T028); al conectar el backend (T027) solo cambia el cuerpo por
 * `apiRequest`. El servidor nunca envía nada por WhatsApp (CA-005-17).
 */
import * as mock from './invitations.mock';

export interface InvitationShare {
  inviteUrl: string;
  /** Texto prellenado para `https://wa.me/?text=…`. */
  text: string;
}

export interface ReminderShare {
  /** Celular verificado del miembro, con `+591…`. */
  phone: string;
  text: string;
}

/** `POST /groups/:groupId/invitations` (RF-005-14): `202`, sin revelar si el correo ya es miembro. */
export function sendInvitation(groupId: string, email: string): Promise<{ status: 'pendiente' }> {
  return mock.sendInvitation(groupId, email);
}

/** `GET /groups/:groupId/invitation-share` (RF-005-15): enlace y texto para WhatsApp. */
export function getInvitationShare(groupId: string): Promise<InvitationShare> {
  return mock.getInvitationShare(groupId);
}

/** `GET /charges/:chargeId/reminder-share` (RF-005-16): `422 CHARGE_NOT_COLLECTABLE` si no aplica. */
export function getReminderShare(chargeId: string): Promise<ReminderShare> {
  return mock.getReminderShare(chargeId);
}
