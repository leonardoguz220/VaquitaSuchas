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
