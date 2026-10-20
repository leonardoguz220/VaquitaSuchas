/**
 * Cliente de los endpoints de notificaciones (spec 005, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato. Todos trabajan sobre la persona con sesión
 * (CA-005-21): el frontend nunca pide avisos de otra persona.
 */
import { apiRequest } from './http';

/** Tipo de aviso por el que se eligen los canales (RF-005-17). */
export type NotificationCategory = 'recordatorios' | 'resoluciones' | 'titular' | 'grupo';

/** `Notification` del contrato (se llama así para no chocar con la API del navegador). */
export interface AppNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  /** Texto plano. */
  title: string;
  /** Texto plano. */
  body: string;
  /** Ruta interna de la app (por ejemplo `/cobros/…`) o `null`. */
  link: string | null;
  /** ISO 8601 en UTC; `null` si no se leyó. */
  readAt: string | null;
  /** ISO 8601 en UTC. */
  createdAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface ListNotificationsParams {
  /** Solo las no leídas. */
  unread?: boolean;
  limit?: number;
  cursor?: string;
}

/**
 * `GET /notifications` (RF-005-01, RF-005-02): de la más reciente a la más antigua, con el
 * contador de no leídas que calcula el backend.
 */
export function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationsPage> {
  const query = new URLSearchParams();
  if (params.unread) query.set('unread', 'true');
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  const suffix = search ? `?${search}` : '';
  return apiRequest<NotificationsPage>(`/api/notifications${suffix}`);
}

/** `GET /notifications/unread-count`: lo consulta la campana cada 30 s. */
export function getUnreadCount(): Promise<{ unreadCount: number }> {
  return apiRequest<{ unreadCount: number }>('/api/notifications/unread-count');
}

/** `POST /notifications/:id/read` (`204`). Una notificación ajena responde `404`. */
export function markNotificationRead(notificationId: string): Promise<void> {
  return apiRequest<void>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  });
}

/** `POST /notifications/read-all` (`204`, CA-005-22). */
export function markAllNotificationsRead(): Promise<void> {
  return apiRequest<void>('/api/notifications/read-all', { method: 'POST' });
}

/** Interruptores por tipo de aviso de un canal (RF-005-17). */
export type ChannelPreferences = Record<NotificationCategory, boolean>;

/** `NotificationPreferences` del contrato. Las notificaciones en la app no tienen campo (RF-005-03). */
export interface NotificationPreferences {
  email: ChannelPreferences;
  telegram: ChannelPreferences & {
    /** `true` si la persona bloqueó el bot (RF-005-28). */
    blocked: boolean;
  };
  /** Rebote permanente del correo. */
  emailProblem: boolean;
  /** Informativo: los correos de seguridad siempre se envían (RF-005-17). */
  securityEmailsAlwaysOn: true;
}

/** Cuerpo de `PUT /notification-preferences`. */
export interface UpdateNotificationPreferencesRequest {
  email: ChannelPreferences;
  telegram: ChannelPreferences;
}

/** `GET /notification-preferences` (RF-005-17). */
export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/api/notification-preferences');
}

/**
 * `PUT /notification-preferences` (RF-005-17; CA-005-11, CA-005-32). El contrato no fija el
 * cuerpo de la respuesta: la pantalla vuelve a pedir las preferencias tras guardar.
 */
export function updateNotificationPreferences(
  input: UpdateNotificationPreferencesRequest,
): Promise<unknown> {
  return apiRequest<unknown>('/api/notification-preferences', { method: 'PUT', body: input });
}

/** `POST /notification-preferences/telegram/reactivate` (RF-005-28; CA-005-33). */
export function reactivateTelegram(): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/api/notification-preferences/telegram/reactivate', {
    method: 'POST',
  });
}

/**
 * `POST /notifications/unsubscribe` (RF-005-18; CA-005-13): pública, con el token firmado del
 * enlace del correo. Desactiva ese tipo de correo y devuelve su categoría. `400` si el token no
 * es válido.
 */
export function unsubscribeEmail(token: string): Promise<{ category: NotificationCategory }> {
  return apiRequest<{ category: NotificationCategory }>('/api/notifications/unsubscribe', {
    method: 'POST',
    body: { token },
  });
}
