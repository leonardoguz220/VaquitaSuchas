/**
 * Cliente de invitaciones y enlaces de WhatsApp (spec 005, `contracts/api.md`, parte B). Una
 * función por endpoint, conectada al backend (T027, T028). El límite de 10 invitaciones por hora
 * llega como `429 RATE_LIMITED` con `details.retryAfterSeconds`. El servidor nunca envía nada por
 * WhatsApp (CA-005-17).
 */
import { apiRequest } from './http';

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
  return apiRequest<{ status: 'pendiente' }>(
    `/api/groups/${encodeURIComponent(groupId)}/invitations`,
    {
      method: 'POST',
      body: { email },
    },
  );
}

/** `GET /groups/:groupId/invitation-share` (RF-005-15): enlace y texto para WhatsApp. */
export function getInvitationShare(groupId: string): Promise<InvitationShare> {
  return apiRequest<InvitationShare>(`/api/groups/${encodeURIComponent(groupId)}/invitation-share`);
}

/** `GET /charges/:chargeId/reminder-share` (RF-005-16): `422 CHARGE_NOT_COLLECTABLE` si no aplica. */
export function getReminderShare(chargeId: string): Promise<ReminderShare> {
  return apiRequest<ReminderShare>(`/api/charges/${encodeURIComponent(chargeId)}/reminder-share`);
}
