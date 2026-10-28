import { formatBsCents } from '../../../shared/domain/format-bs.js';
import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import type { NotificationType } from './catalog.js';

// Textos de los avisos (RF-005-27, RNF-005-02, RNF-005-07): español de Bolivia, montos `Bs 25,50`
// y fechas en hora de La Paz. Función pura: no lee el reloj ni la configuración.
// - Dentro de la app (title/body) el aviso es privado de quien lo recibe y puede llevar nombres,
//   montos y datos de pago.
// - El correo lleva solo el nombre y los montos necesarios: nunca datos de pago ni el contenido de
//   un chat ni comprobantes.
// - Telegram lleva un texto corto sin datos sensibles y el enlace a la app.

export const TITLE_MAX = 120;
export const BODY_MAX = 500;

/** Datos que pueden necesitar los avisos; cada tipo exige solo los suyos. */
export interface NotificationData {
  /** Nombre de otra persona (miembro, solicitante o titular según el aviso). */
  personName?: string;
  groupName?: string;
  groupId?: string;
  chargeId?: string;
  requestId?: string;
  disputeId?: string;
  /** Monto en centavos enteros. */
  amountCents?: number;
  /** Vencimiento, plazo o fecha límite (instante UTC; se muestra en La Paz). */
  dueAt?: Date;
  /** Período del cobro, `AAAA-MM`. */
  period?: string;
  /** Motivo escrito por una persona (rechazo, resolución). */
  reason?: string;
  /** Cómo pagar (solo dentro de la app). */
  paymentInfo?: string;
  /** Minutos del plazo (15 o 60 en las solicitudes). */
  minutes?: number;
  /** Cantidad de mensajes agrupados en un aviso de chat. */
  count?: number;
  /** Cupos liberados (retiro por mora al titular). */
  slotsFreed?: number;
  /** URL pública de la app; si está, el texto de Telegram lleva el enlace completo. */
  appUrl?: string;
  /** Enlace para dejar de recibir ese tipo de correo (RF-005-18). */
  unsubscribeUrl?: string;
}

export interface RenderedNotification {
  title: string;
  body: string;
  /** Ruta interna de la app (empieza con una sola `/`), o `null` si no hay pantalla destino. */
  link: string | null;
  emailSubject: string;
  emailText: string;
  telegramText: string;
}

interface Parts {
  title: string;
  body: string;
  /** Texto del correo si debe ser distinto del de la app (sin datos de pago ni chat). */
  email?: string;
  /** Texto corto de Telegram, sin montos ni datos sensibles. */
  short: string;
  link: string | null;
}

export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `15 de noviembre de 2026`, en hora de La Paz. */
export function formatLaPazDate(date: Date): string {
  const p = toLaPazParts(date);
  return `${p.day} de ${MONTHS[p.month - 1]} de ${p.year}`;
}

/** `15 de noviembre de 2026, 14:05`, en hora de La Paz. */
export function formatLaPazDateTime(date: Date): string {
  const p = toLaPazParts(date);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${formatLaPazDate(date)}, ${hh}:${mm}`;
}

function need<T>(value: T | undefined, field: string, type: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`El aviso ${type} necesita el dato ${field}.`);
  }
  return value;
}

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const chargeLink = (d: NotificationData, type: string): string =>
  `/cobros/${need(d.chargeId, 'chargeId', type)}`;
const groupLink = (d: NotificationData, type: string): string =>
  `/grupos/${need(d.groupId, 'groupId', type)}`;
const requestLink = (d: NotificationData, type: string): string =>
  `/solicitudes/${need(d.requestId, 'requestId', type)}`;
const shortfallLink = (d: NotificationData, type: string): string =>
  `/grupos/${need(d.groupId, 'groupId', type)}/faltante`;

function build(type: NotificationType, d: NotificationData): Parts {
  const name = (): string => need(d.personName, 'personName', type);
  const group = (): string => need(d.groupName, 'groupName', type);
  const amount = (): string => formatBsCents(need(d.amountCents, 'amountCents', type));
  const due = (): string => formatLaPazDate(need(d.dueAt, 'dueAt', type));
  const dueTime = (): string => formatLaPazDateTime(need(d.dueAt, 'dueAt', type));
  const reason = (): string => need(d.reason, 'reason', type);

  switch (type) {
    case 'cobro_generado': {
      const pay = d.paymentInfo ? ` Cómo pagar: ${d.paymentInfo}` : '';
      return {
        title: `Nuevo cobro de ${group()}`,
        body: `Tu cuota es ${amount()} y vence el ${due()}.${pay}`,
        email: `Se generó tu cobro de ${group()}: ${amount()}, con vencimiento el ${due()}. Entra a Vaquita para ver cómo pagarlo.`,
        short: 'Tienes un nuevo cobro en Vaquita.',
        link: chargeLink(d, type),
      };
    }
    case 'pago_confirmado':
      return {
        title: `Pago confirmado en ${group()}`,
        body: `El titular confirmó tu pago de ${amount()}. ¡Gracias!`,
        short: 'Tu pago fue confirmado.',
        link: chargeLink(d, type),
      };
    case 'pago_rechazado':
      return {
        title: `Pago rechazado en ${group()}`,
        body: `El titular rechazó tu comprobante. Motivo: ${reason()}. Puedes subir uno nuevo.`,
        short: 'Tu comprobante fue rechazado. Revisa el motivo en la app.',
        link: chargeLink(d, type),
      };
    case 'retiro_por_mora': {
      const pay = d.paymentInfo ? ` Cómo pagar: ${d.paymentInfo}` : '';
      return {
        title: `Te retiraron de ${group()}`,
        body: `Te retiraron del grupo por falta de pago. Deuda pendiente: ${amount()}.${pay}`,
        email: `Te retiraron de ${group()} por falta de pago. Deuda pendiente: ${amount()}. Entra a Vaquita para ver cómo saldarla.`,
        short: 'Te retiraron de un grupo por falta de pago.',
        link: chargeLink(d, type),
      };
    }
    case 'retiro_por_mora_titular': {
      const slots = d.slotsFreed ?? 1;
      return {
        title: `${name()} fue retirado de ${group()}`,
        body: `${name()} fue retirado por falta de pago (${amount()} adeudados). Se liberó ${slots === 1 ? '1 cupo' : `${slots} cupos`}.`,
        short: 'Un miembro fue retirado de tu grupo por falta de pago.',
        link: chargeLink(d, type),
      };
    }
    case 'comprobante_subido':
      return {
        title: `Comprobante nuevo en ${group()}`,
        body: `${name()} subió su comprobante de ${amount()}. Revísalo y confirma el pago.`,
        email: `${name()} subió un comprobante en ${group()}. Entra a Vaquita para revisarlo.`,
        short: 'Un miembro subió un comprobante para revisar.',
        link: chargeLink(d, type),
      };
    case 'miembro_se_une':
      return {
        title: `${name()} se unió a ${group()}`,
        body: `${name()} ahora es miembro de ${group()}.`,
        short: 'Un nuevo miembro se unió a tu grupo.',
        link: groupLink(d, type),
      };
    case 'miembro_abandona':
      return {
        title: `${name()} dejó ${group()}`,
        body: `${name()} abandonó el grupo y se liberó su cupo.`,
        short: 'Un miembro dejó tu grupo.',
        link: groupLink(d, type),
      };
    case 'miembro_quitado':
      return {
        title: `Ya no estás en ${group()}`,
        body: `El titular te quitó de ${group()}.`,
        short: 'Ya no eres miembro de un grupo.',
        link: '/grupos',
      };
    case 'titularidad_cambiada':
      return {
        title: `Nuevo titular en ${group()}`,
        body: `${name()} es ahora el titular de ${group()}.`,
        short: 'Cambió el titular de uno de tus grupos.',
        link: groupLink(d, type),
      };
    case 'grupo_cerrado':
      return {
        title: `${group()} se cerró`,
        body: `El grupo ${group()} fue cerrado. Ya no se generarán cobros.`,
        short: 'Uno de tus grupos se cerró.',
        link: '/grupos',
      };
    case 'titular_suspendido':
      return {
        title: `Titular suspendido en ${group()}`,
        body: `El titular de ${group()} fue suspendido. Los cobros del grupo quedan en pausa mientras tanto.`,
        short: 'El titular de uno de tus grupos fue suspendido.',
        link: groupLink(d, type),
      };
    case 'titular_baneado':
      return {
        title: `Grupo congelado: ${group()}`,
        body: `El titular de ${group()} fue dado de baja y el grupo quedó congelado. Revisa tus opciones en la app.`,
        short: 'Uno de tus grupos fue congelado.',
        link: groupLink(d, type),
      };
    case 'solicitud_nueva':
      return {
        title: `Nueva solicitud para ${group()}`,
        body: `${name()} quiere unirse a ${group()}. Revisa su solicitud.`,
        short: 'Tienes una nueva solicitud de ingreso.',
        link: requestLink(d, type),
      };
    case 'solicitud_comprobante': {
      const minutes = d.minutes ?? 60;
      return {
        title: `${name()} envió su comprobante`,
        body: `${name()} subió su comprobante para ${group()}. Tienes ${minutes} minutos para aceptar o rechazar.`,
        short: 'Un solicitante envió su comprobante. Tienes un plazo para decidir.',
        link: requestLink(d, type),
      };
    }
    case 'solicitud_recordatorio_30':
      return {
        title: 'Decide sobre una solicitud',
        body: `Pasaron 30 minutos y la solicitud de ${name()} a ${group()} sigue sin respuesta.`,
        short: 'Tienes una solicitud pendiente de decisión.',
        link: requestLink(d, type),
      };
    case 'solicitud_datos_pago': {
      const minutes = d.minutes ?? 15;
      const pay = d.paymentInfo ? ` Cómo pagar: ${d.paymentInfo}` : '';
      return {
        title: `Datos de pago de ${group()}`,
        body: `Paga ${amount()} en un plazo de ${minutes} minutos.${pay}`,
        email: `El titular de ${group()} te envió los datos de pago. Tienes ${minutes} minutos para pagar ${amount()}. Entra a Vaquita para verlos.`,
        short: 'El titular te envió los datos de pago. Tienes un plazo para pagar.',
        link: requestLink(d, type),
      };
    }
    case 'solicitud_aceptada':
      return {
        title: `Te aceptaron en ${group()}`,
        body: `Tu solicitud fue aceptada. Ya eres miembro de ${group()}.`,
        short: 'Tu solicitud fue aceptada.',
        link: groupLink(d, type),
      };
    case 'solicitud_rechazada':
      return {
        title: `Solicitud rechazada en ${group()}`,
        body: `Tu solicitud no fue aceptada. Motivo: ${reason()}.`,
        short: 'Tu solicitud fue rechazada. Revisa el motivo en la app.',
        link: requestLink(d, type),
      };
    case 'solicitud_expirada':
      return {
        title: `Solicitud vencida en ${group()}`,
        body: `La solicitud a ${group()} venció sin completarse. Puedes enviar otra.`,
        short: 'Una solicitud de ingreso venció.',
        link: requestLink(d, type),
      };
    case 'solicitud_mensaje': {
      const count = d.count ?? 1;
      return {
        title: count > 1 ? `${count} mensajes nuevos de ${name()}` : `Mensaje nuevo de ${name()}`,
        body: `Tienes ${count === 1 ? 'un mensaje sin leer' : `${count} mensajes sin leer`} en la solicitud de ${group()}.`,
        short: 'Tienes mensajes nuevos en una solicitud.',
        link: requestLink(d, type),
      };
    }
    case 'reclamo_abierto':
      return {
        title: `Reclamo abierto en ${group()}`,
        body: `${name()} abrió un reclamo sobre la solicitud de ${group()}. Puedes responder desde la solicitud.`,
        short: 'Se abrió un reclamo que te involucra.',
        link: requestLink(d, type),
      };
    case 'reclamo_resuelto':
      return {
        title: `Reclamo resuelto en ${group()}`,
        body: `El reclamo sobre la solicitud de ${group()} fue resuelto. Resolución: ${reason()}.`,
        short: 'Un reclamo fue resuelto.',
        link: requestLink(d, type),
      };
    case 'publicacion_decision':
      return {
        title: `Decisión sobre tu publicación`,
        body: `Hay una decisión sobre tu publicación de ${group()}. Motivo: ${reason()}.`,
        short: 'Hay una decisión sobre tu publicación.',
        link: '/cupos',
      };
    case 'publicacion_oculta':
      return {
        title: `Tu publicación de ${group()} está oculta`,
        body: `Tu publicación de ${group()} se ocultó. Motivo: ${reason()}.`,
        short: 'Una de tus publicaciones se ocultó.',
        link: '/cupos',
      };
    case 'publicacion_transferida':
      return {
        title: `Recibiste una publicación de ${group()}`,
        body: `La publicación de ${group()} pasó a ti como nuevo titular.`,
        short: 'Una publicación pasó a tu cuenta.',
        link: '/cupos',
      };
    case 'faltante_abierto':
      return {
        title: `Falta dinero en ${group()}`,
        body: `El titular avisó que falta cubrir una parte del servicio. Puedes pagar ${amount()} más o pedir tu devolución antes del ${due()}.`,
        short: 'El titular de un grupo avisó que falta cubrir una parte del servicio.',
        link: shortfallLink(d, type),
      };
    case 'faltante_pago_informado':
      return {
        title: `Pago adicional en ${group()}`,
        body: `${name()} informó su pago adicional de ${amount()}. Revísalo y confírmalo.`,
        short: 'Un miembro informó un pago adicional para revisar.',
        link: shortfallLink(d, type),
      };
    case 'faltante_pago_resuelto':
      return {
        title: `Tu pago adicional en ${group()}`,
        body: d.reason
          ? `El titular rechazó tu pago adicional. Motivo: ${d.reason}. Puedes informarlo de nuevo.`
          : 'El titular confirmó tu pago adicional.',
        short: 'El titular resolvió tu pago adicional. Revisa el detalle en la app.',
        link: shortfallLink(d, type),
      };
    case 'faltante_cerrado':
      return {
        title: `Se cerró el faltante de ${group()}`,
        body: `La ronda para cubrir lo que faltaba en ${group()} terminó.`,
        short: 'Terminó la ronda para cubrir un faltante.',
        link: shortfallLink(d, type),
      };
    case 'devolucion_pendiente':
      return {
        title: `Devolución pendiente en ${group()}`,
        body: `${name()} salió del grupo y le corresponde una devolución de ${amount()}. Regístrala cuando la hagas.`,
        short: 'Tienes una devolución pendiente de registrar.',
        link: shortfallLink(d, type),
      };
    case 'devolucion_registrada':
      return {
        title: `Registraron tu devolución en ${group()}`,
        body: `El titular registró la devolución de ${amount()}. Confirma si la recibiste o dispútala.`,
        short: 'El titular registró tu devolución. Confírmala en la app.',
        link: shortfallLink(d, type),
      };
    case 'devolucion_resuelta':
      return {
        title: `Devolución ${d.reason ?? 'resuelta'} en ${group()}`,
        body: `${name()} marcó la devolución como ${d.reason ?? 'resuelta'}.`,
        short: 'Hay novedades sobre una devolución.',
        link: shortfallLink(d, type),
      };
    case 'aviso_previo':
      return {
        title: `Tu cobro de ${group()} se acerca`,
        body: `En 2 días se genera tu cobro de ${group()}. Monto estimado: ${amount()}.`,
        short: 'Se acerca la fecha de tu próximo cobro.',
        link: groupLink(d, type),
      };
    case 'recordatorio_vencimiento':
      return {
        title: `Tu cobro de ${group()} vence mañana`,
        body: `Tu cuota de ${amount()} vence el ${due()}. Sube tu comprobante a tiempo.`,
        short: 'Tu cobro vence mañana.',
        link: chargeLink(d, type),
      };
    case 'comprobante_pendiente_48h':
      return {
        title: `Comprobante sin revisar en ${group()}`,
        body: `${name()} subió un comprobante hace más de 48 horas y sigue sin revisión (desde el ${dueTime()}).`,
        short: 'Tienes un comprobante sin revisar hace más de 48 horas.',
        link: chargeLink(d, type),
      };
  }
}

/** Texto final de un aviso para la app, el correo y Telegram. Lanza si falta un dato del tipo. */
export function render(type: NotificationType, data: NotificationData): RenderedNotification {
  const parts = build(type, data);
  if (parts.link !== null && !/^\/[^/]/.test(parts.link)) {
    throw new Error('El enlace de un aviso debe ser una ruta interna.');
  }
  const title = clip(parts.title, TITLE_MAX);
  const body = clip(parts.body, BODY_MAX);
  const footer = data.unsubscribeUrl
    ? `\n\nSi ya no quieres recibir este tipo de correos, desactívalos aquí: ${data.unsubscribeUrl}`
    : '';
  const url =
    parts.link === null ? null : `${(data.appUrl ?? '').replace(/\/+$/, '')}${parts.link}`;
  return {
    title,
    body,
    link: parts.link,
    emailSubject: title,
    emailText: `${parts.email ?? body}${url && data.appUrl ? `\n\nAbrir en Vaquita: ${url}` : ''}${footer}`,
    telegramText: url && data.appUrl ? `${parts.short} ${url}` : parts.short,
  };
}

// Datos de relleno: el texto corto de Telegram es fijo por tipo y no usa ninguno de ellos.
const FILLER: NotificationData = {
  personName: 'x',
  groupName: 'x',
  groupId: 'x',
  chargeId: 'x',
  requestId: 'x',
  disputeId: 'x',
  amountCents: 0,
  dueAt: new Date(0),
  period: '1970-01',
  reason: 'x',
  minutes: 0,
  count: 1,
  slotsFreed: 1,
};

/**
 * Texto de Telegram de un aviso ya guardado (RF-005-27, RNF-005-02): solo la frase corta del tipo
 * y el enlace a la app. No recibe el título ni el cuerpo, así que no puede filtrar montos, motivos
 * ni datos de pago. `link` es la ruta interna guardada con el aviso.
 */
export function telegramTextFor(
  type: NotificationType,
  link: string | null,
  appUrl: string,
): string {
  const short = build(type, FILLER).short;
  return link && /^\/[^/]/.test(link) ? `${short} ${appUrl.replace(/\/+$/, '')}${link}` : short;
}
