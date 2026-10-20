/**
 * Datos simulados de invitaciones y WhatsApp (spec 005 T028) mientras el backend no está
 * conectado. El texto, el enlace y el celular ya vienen armados, como los entregaría la API.
 * Nombres, montos y números inventados.
 */
import { ApiError } from './http';
import type { InvitationShare, ReminderShare } from './invitations';

const LATENCY_MS = 350;
const HOURLY_LIMIT = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

/** Ids del simulador que responden con un error del contrato. */
export const MOCK_INVITATION_IDS = {
  /** Grupo cerrado: `422 GROUP_CLOSED`. */
  closedGroup: 'grupo-cerrado',
  /** Cobro ya pagado o de un exmiembro: `422 CHARGE_NOT_COLLECTABLE`. */
  notCollectableCharge: '7a1c5e00-0000-4000-8000-000000000504',
} as const;

let sentThisHour = 0;

/** Vuelve al estado inicial (para las pruebas). */
export function resetInvitationsMock() {
  sentThisHour = 0;
}

export function sendInvitation(groupId: string, email: string): Promise<{ status: 'pendiente' }> {
  return delay(() => {
    if (!EMAIL.test(email.trim())) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Correo inválido.', {
        fields: [{ field: 'email', message: 'Correo inválido.' }],
      });
    }
    if (groupId === MOCK_INVITATION_IDS.closedGroup) {
      throw new ApiError(422, 'GROUP_CLOSED', 'El grupo está cerrado.');
    }
    if (sentThisHour >= HOURLY_LIMIT) {
      throw new ApiError(429, 'RATE_LIMITED', 'Demasiadas invitaciones.', {
        retryAfterSeconds: 1800,
      });
    }
    sentThisHour += 1;
    return { status: 'pendiente' };
  });
}

export function getInvitationShare(groupId: string): Promise<InvitationShare> {
  return delay(() => {
    const inviteUrl = 'https://vaquita.example/unirse?codigo=K7M2Q9XA';
    if (groupId === MOCK_INVITATION_IDS.closedGroup) {
      throw new ApiError(422, 'GROUP_CLOSED', 'El grupo está cerrado.');
    }
    return {
      inviteUrl,
      text: `Te invito a mi suscripción compartida en Vaquita. Entra con este enlace: ${inviteUrl} (código K7M2Q9XA).`,
    };
  });
}

export function getReminderShare(chargeId: string): Promise<ReminderShare> {
  return delay(() => {
    if (chargeId === MOCK_INVITATION_IDS.notCollectableCharge) {
      throw new ApiError(422, 'BUSINESS_RULE', 'Este cobro no se puede recordar.', {
        code: 'CHARGE_NOT_COLLECTABLE',
      });
    }
    return {
      phone: '+59171234567',
      text: 'Hola, te recuerdo tu cuota de octubre de Prime Video: Bs 12,40, vence el 21 oct. ¡Gracias!',
    };
  });
}
