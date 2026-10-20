import type { MailMessage } from '../../../shared/ports/mail.service.js';

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Correo de suspensión con el motivo y, si está configurado, el contacto de apelaciones
 * (RF-009-11). Pura: no registra nada; el motivo solo viaja en el cuerpo del mensaje.
 */
export function buildSuspensionMail(input: {
  to: string;
  reason: string;
  appealEmail: string | undefined;
}): MailMessage {
  const appeal = input.appealEmail
    ? `Si crees que es un error, escribe a ${input.appealEmail} para apelar.`
    : 'Si crees que es un error, responde por los canales de contacto del equipo de Vaquita para apelar.';
  return {
    to: input.to,
    subject: 'Tu cuenta de Vaquita fue suspendida',
    text: `Tu cuenta de Vaquita fue suspendida y no podrás iniciar sesión.\n\nMotivo: ${input.reason}\n\n${appeal}`,
    html:
      `<p>Tu cuenta de Vaquita fue suspendida y no podrás iniciar sesión.</p>` +
      `<p><strong>Motivo:</strong> ${escapeHtml(input.reason)}</p>` +
      `<p>${escapeHtml(appeal)}</p>`,
  };
}
