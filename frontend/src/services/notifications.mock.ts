/**
 * Datos simulados de la spec 005 mientras el backend no está conectado (T012 y T023). Los textos,
 * el contador de no leídas y las preferencias ya vienen resueltos, como los entregaría la API:
 * aquí no se decide nada del dominio. Nombres, montos y fechas inventados.
 */
import { ApiError } from './http';
import type {
  AppNotification,
  ListNotificationsParams,
  NotificationCategory,
  NotificationPreferences,
  NotificationsPage,
  UpdateNotificationPreferencesRequest,
} from './notifications';

const LATENCY_MS = 350;
const DEFAULT_LIMIT = 20;

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

const uuid = (suffix: string) => `6f2b9a00-0000-4000-8000-${suffix}`;

/** Token válido del simulador para `/avisos/desactivar?token=`; cualquier otro responde `400`. */
export const MOCK_UNSUBSCRIBE_TOKENS = { valid: 'token-recordatorios' } as const;

const SEED: AppNotification[] = [
  {
    id: uuid('000000000001'),
    type: 'cobro_generado',
    category: 'recordatorios',
    title: 'Se generó tu cobro de octubre',
    body: 'Spotify depa · Bs 19,80 · vence el 21 oct.',
    link: '/cobros/7a1c5e00-0000-4000-8000-000000000101',
    readAt: null,
    createdAt: '2026-10-18T14:30:00.000Z',
  },
  {
    id: uuid('000000000002'),
    type: 'comprobante_subido',
    category: 'titular',
    title: 'Luis Arce subió un comprobante',
    body: 'Netflix de la U · lleva más de 48 horas sin revisar.',
    link: '/cobros/7a1c5e00-0000-4000-8000-000000000501',
    readAt: null,
    createdAt: '2026-10-17T14:30:00.000Z',
  },
  {
    id: uuid('000000000003'),
    type: 'solicitud_recibida',
    category: 'titular',
    title: 'Lucía Mendoza quiere unirse',
    body: 'Max de amigos · tienes 24 horas para responder.',
    link: '/solicitudes/3e8a1d00-0000-4000-8000-000000000006',
    readAt: null,
    createdAt: '2026-10-16T20:10:00.000Z',
  },
  {
    id: uuid('000000000004'),
    type: 'pago_confirmado',
    category: 'resoluciones',
    title: 'Tu pago fue confirmado',
    body: 'Disney+ primos · octubre · Bs 22,10',
    link: null,
    readAt: '2026-10-13T16:00:00.000Z',
    createdAt: '2026-10-13T15:00:00.000Z',
  },
  {
    id: uuid('000000000005'),
    type: 'miembro_nuevo',
    category: 'grupo',
    title: 'Marco se unió a Spotify depa',
    body: 'Ahora son 6 en el grupo. Tu cuota del próximo mes baja.',
    link: '/grupos/5b0d7c3e-0000-4000-8000-000000000103',
    readAt: '2026-10-10T12:00:00.000Z',
    createdAt: '2026-10-10T11:30:00.000Z',
  },
];

/** Estado del simulador mientras dura la pestaña: marcar como leída se ve en la campana. */
let notifications = SEED.map((item) => ({ ...item }));
let preferences: NotificationPreferences = {
  email: { recordatorios: true, resoluciones: true, titular: true, grupo: false },
  telegram: {
    recordatorios: true,
    resoluciones: false,
    titular: true,
    grupo: false,
    blocked: true,
  },
  emailProblem: false,
  securityEmailsAlwaysOn: true,
};

/** Vuelve al estado inicial (para las pruebas). */
export function resetNotificationsMock() {
  notifications = SEED.map((item) => ({ ...item }));
  preferences = {
    ...preferences,
    email: { recordatorios: true, resoluciones: true, titular: true, grupo: false },
    telegram: {
      recordatorios: true,
      resoluciones: false,
      titular: true,
      grupo: false,
      blocked: true,
    },
  };
}

function copyPreferences(): NotificationPreferences {
  return { ...preferences, email: { ...preferences.email }, telegram: { ...preferences.telegram } };
}

const unreadCount = () => notifications.filter((item) => item.readAt === null).length;

export function listNotifications(params: ListNotificationsParams): Promise<NotificationsPage> {
  return delay(() => {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const visible = params.unread
      ? notifications.filter((item) => item.readAt === null)
      : notifications;
    const start = params.cursor ? Number(params.cursor) : 0;
    if (!Number.isInteger(start) || start < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor inválido.');
    }
    const items = visible.slice(start, start + limit);
    const end = start + items.length;
    return {
      items: items.map((item) => ({ ...item })),
      nextCursor: end < visible.length ? String(end) : null,
      unreadCount: unreadCount(),
    };
  });
}

export function getUnreadCount(): Promise<{ unreadCount: number }> {
  return delay(() => ({ unreadCount: unreadCount() }));
}

/** Marcar una ya leída no cambia nada; un id ajeno o desconocido responde `404`. */
export function markNotificationRead(notificationId: string): Promise<void> {
  return delay(() => {
    const item = notifications.find((candidate) => candidate.id === notificationId);
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Notificación no encontrada.');
    item.readAt ??= new Date().toISOString();
  });
}

export function markAllNotificationsRead(): Promise<void> {
  return delay(() => {
    const now = new Date().toISOString();
    notifications.forEach((item) => {
      item.readAt ??= now;
    });
  });
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return delay(() => copyPreferences());
}

export function updateNotificationPreferences(
  input: UpdateNotificationPreferencesRequest,
): Promise<NotificationPreferences> {
  return delay(() => {
    preferences = {
      ...preferences,
      email: { ...input.email },
      telegram: { ...input.telegram, blocked: preferences.telegram.blocked },
    };
    return copyPreferences();
  });
}

export function reactivateTelegram(): Promise<NotificationPreferences> {
  return delay(() => {
    preferences = { ...preferences, telegram: { ...preferences.telegram, blocked: false } };
    return copyPreferences();
  });
}

export function unsubscribeEmail(token: string): Promise<{ category: NotificationCategory }> {
  return delay(() => {
    if (token !== MOCK_UNSUBSCRIBE_TOKENS.valid) {
      throw new ApiError(400, 'INVALID_TOKEN', 'El enlace venció o no es válido.');
    }
    preferences = { ...preferences, email: { ...preferences.email, recordatorios: false } };
    return { category: 'recordatorios' };
  });
}
