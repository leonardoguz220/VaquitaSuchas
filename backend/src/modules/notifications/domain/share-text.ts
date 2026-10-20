import { formatBsCents } from '../../../shared/domain/format-bs.js';
import { MONTHS, formatLaPazDate } from './templates.js';

// Textos prellenados para WhatsApp (RF-005-15, RF-005-16). Funciones puras: el servidor solo
// devuelve el texto y el cliente arma el enlace `wa.me`; no se envía nada desde aquí.

export interface InviteMessageInput {
  groupName: string;
  /** Enlace completo `{APP_URL}/unirse?codigo=XXXXXXXX`. */
  inviteUrl: string;
  code: string;
}

export function inviteMessage(i: InviteMessageInput): string {
  return (
    `¡Hola! Te invito a unirte a mi grupo "${i.groupName}" en Vaquita para compartir la suscripción. ` +
    `Entra aquí: ${i.inviteUrl}\nMi código de invitación es ${i.code}.`
  );
}

export interface ReminderMessageInput {
  memberName: string;
  groupName: string;
  /** Cuota en centavos enteros. */
  amountCents: number;
  /** Período del cobro, `AAAA-MM`. */
  period: string;
  dueAt: Date;
}

/** `octubre de 2026` a partir de `2026-10`; si el formato no cuadra, devuelve el texto tal cual. */
export function periodLabel(period: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return period;
  return `${MONTHS[Number(match[2]) - 1]} de ${match[1]}`;
}

export function reminderMessage(i: ReminderMessageInput): string {
  return (
    `Hola ${i.memberName}, te recuerdo tu cuota de ${formatBsCents(i.amountCents)} ` +
    `del grupo "${i.groupName}" correspondiente a ${periodLabel(i.period)}. ` +
    `Vence el ${formatLaPazDate(i.dueAt)}. Puedes pagarla y subir tu comprobante en Vaquita. ¡Gracias!`
  );
}

export interface InviteEmailInput {
  inviterName: string;
  groupName: string;
  inviteUrl: string;
  code: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Correo de invitación (RF-005-14): enlace y código; el invitado aún no es parte del grupo. */
export function inviteEmail(i: InviteEmailInput): { subject: string; text: string; html: string } {
  const intro = `${i.inviterName} te invita a unirte al grupo "${i.groupName}" en Vaquita.`;
  const how =
    'Entra con este enlace (si no tienes sesión, inicia sesión o regístrate y volverás aquí):';
  const codeLine = `Tu código de invitación es ${i.code}.`;
  return {
    subject: `${i.inviterName} te invita a un grupo en Vaquita`,
    text: [intro, `${how} ${i.inviteUrl}`, codeLine].join('\n\n'),
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p>${escapeHtml(how)} <a href="${escapeHtml(i.inviteUrl)}">Unirme al grupo</a></p>` +
      `<p>${escapeHtml(codeLine)}</p>`,
  };
}
