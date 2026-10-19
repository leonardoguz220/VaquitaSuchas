/**
 * Textos del centro de notificaciones (plan 005 §6). Los errores se eligen por `code` y estado
 * HTTP, nunca por `message` (contrato 000 A.2). El contador y el estado leído/no leído salen de
 * la API.
 */
import { isConnectionError, type ApiError } from '@/services/http';
import type { NotificationCategory } from '@/services/notifications';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const NOTIFICATION_MESSAGES = {
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  /** RF-005-03 y RF-005-21. */
  appAlwaysOn:
    'Las notificaciones de la app no se desactivan y se guardan 90 días. Los correos y los avisos por Telegram se eligen en Ajustes de avisos.',
  unread: 'No leída',
  read: 'Leída',
} as const;

/** Detalle del aviso cuando falla una llamada que no es un `401`. */
export function notificationErrorMessage(error: ApiError): string {
  return isConnectionError(error)
    ? NOTIFICATION_MESSAGES.connection
    : NOTIFICATION_MESSAGES.unexpected;
}

/** Nombre de cada tipo de aviso (RF-005-17). */
export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  recordatorios: 'Recordatorios de pago',
  resoluciones: 'Resoluciones de pago',
  titular: 'Avisos como titular',
  grupo: 'Avisos de grupo',
};

/**
 * Nombre accesible de la campana: el número de no leídas en texto, no solo en color
 * (RNF-005-06). `null` mientras no se conoce.
 */
export function bellLabel(count: number | null): string {
  if (count === null) return 'Notificaciones';
  if (count === 0) return 'Notificaciones, ninguna sin leer';
  return `Notificaciones, ${count} sin leer`;
}

/** Número visible sobre la campana (`99+` si no entra). */
export function bellCountText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Qué incluye cada tipo de aviso en los ajustes (catálogo del plan 005 §5). */
export const CATEGORY_DESCRIPTION: Record<NotificationCategory, string> = {
  recordatorios:
    'Como miembro: aviso 2 días antes del corte, cobro generado y recordatorio 1 día antes del vencimiento.',
  resoluciones: 'Como miembro: tu pago fue confirmado o rechazado, con el motivo.',
  titular:
    'Como titular: comprobantes recibidos o sin revisar, entradas y salidas de miembros, retiros por falta de pago y solicitudes de ingreso.',
  grupo:
    'Cambios en tus grupos: retiros, cambio de titular, cierre, solicitudes de ingreso que abriste y reclamos.',
};

export const SETTINGS_MESSAGES = {
  /** RF-005-03 y RF-005-17: texto fijo. */
  fixedRules:
    'Las notificaciones dentro de la app no se pueden desactivar. Los correos de seguridad (recuperar contraseña, cambios de cuenta) siempre se envían.',
  emailProblemTitle: 'Tu correo tiene problemas de entrega.',
  emailProblem:
    'Tu proveedor de correo rechazó nuestros mensajes, así que dejamos de enviarte correos. Revisa que tu dirección esté bien escrita. Mientras tanto, sigues viendo todos tus avisos en la app.',
  telegramActive:
    'Te avisamos en la cuenta con la que verificaste tu celular. Si bloqueas al bot, aquí verás «Reactivar».',
  telegramBlocked:
    'Bloqueaste al bot de Vaquita, así que pausamos tus avisos por Telegram. Tu celular sigue verificado. Abre Telegram, inicia de nuevo el bot y toca «Reactivar».',
  stillBlocked:
    'Todavía vemos el bot bloqueado. Inicia de nuevo el bot de Vaquita en Telegram y vuelve a tocar «Reactivar».',
  reactivated: 'Listo, volvimos a activar tus avisos por Telegram.',
  saved: 'Guardamos tus preferencias de avisos.',
} as const;
