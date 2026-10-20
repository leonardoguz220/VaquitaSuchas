import type { NotificationType } from './catalog.js';

// Contenido del correo de un aviso (RF-005-18, RNF-005-02). El texto de la app puede traer datos
// de pago o de otras personas; por eso en estos tipos el correo solo lleva el título y remite a la app.

/** Tipos cuyo cuerpo en la app incluye datos que no deben viajar por correo. */
export const EMAIL_BODY_WITHHELD: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'cobro_generado',
  'retiro_por_mora',
  'solicitud_datos_pago',
  'solicitud_mensaje',
]);

export interface EmailContentInput {
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  /** URL pública de la app, sin barra final. */
  appUrl: string;
  /** Enlace para dejar de recibir este tipo de correo. */
  unsubscribeUrl: string;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildEmailContent(i: EmailContentInput): EmailContent {
  const main = EMAIL_BODY_WITHHELD.has(i.type)
    ? `${i.title}. Entra a Vaquita para ver los detalles.`
    : i.body;
  const open = i.link ? `${i.appUrl}${i.link}` : null;
  const footer = `Si ya no quieres recibir este tipo de correos, desactívalos aquí: ${i.unsubscribeUrl}`;
  const text = [main, open ? `Abrir en Vaquita: ${open}` : null, footer]
    .filter((p): p is string => p !== null)
    .join('\n\n');
  const html = [
    `<p>${escapeHtml(main)}</p>`,
    open ? `<p><a href="${escapeHtml(open)}">Abrir en Vaquita</a></p>` : '',
    `<p style="color:#666;font-size:12px">Si ya no quieres recibir este tipo de correos, ` +
      `<a href="${escapeHtml(i.unsubscribeUrl)}">desactívalos aquí</a>.</p>`,
  ].join('');
  return { subject: i.title, text, html };
}
