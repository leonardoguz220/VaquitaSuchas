export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

// Correo con el enlace de recuperación (vence a los 30 minutos).
export function passwordResetMail(link: string): MailContent {
  return {
    subject: 'Recupera tu contraseña de Vaquita',
    text: `Pediste restablecer tu contraseña de Vaquita.\n\nAbre este enlace en los próximos 30 minutos: ${link}\n\nSi no fuiste tú, ignora este mensaje.`,
    html: `<p>Pediste restablecer tu contraseña de Vaquita.</p><p><a href="${link}">Restablecer mi contraseña</a> (vale 30 minutos).</p><p>Si no fuiste tú, ignora este mensaje.</p>`,
  };
}

// Aviso de que la contraseña cambió (RF-003-12).
export function passwordChangedMail(): MailContent {
  return {
    subject: 'Tu contraseña de Vaquita cambió',
    text: 'La contraseña de tu cuenta de Vaquita acaba de cambiar. Si no fuiste tú, recupérala de inmediato desde la pantalla de ingreso.',
    html: '<p>La contraseña de tu cuenta de Vaquita acaba de cambiar.</p><p>Si no fuiste tú, recupérala de inmediato desde la pantalla de ingreso.</p>',
  };
}
