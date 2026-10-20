import { apiRequest } from './http';
import {
  getNotificationPreferences,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  reactivateTelegram,
  unsubscribeEmail,
  updateNotificationPreferences,
} from './notifications';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);
const NOTIFICATION_ID = '5b0d7c3e-0000-4000-8000-0000000000a1';

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] };
}

describe('services/notifications conectado al backend (contrato 005)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({} as never);
  });

  it('RF-005-01: listNotifications pide GET /api/notifications y devuelve la página tal cual', async () => {
    const page = { items: [], nextCursor: null, unreadCount: 0 };
    mockedRequest.mockResolvedValueOnce(page as never);
    await expect(listNotifications()).resolves.toBe(page);
    expect(lastCall().path).toBe('/api/notifications');
  });

  it('RF-005-02: el filtro unread, el límite y el cursor van en la query', async () => {
    await listNotifications({ unread: true, limit: 20, cursor: 'abc' });
    expect(lastCall().path).toBe('/api/notifications?unread=true&limit=20&cursor=abc');
    await listNotifications({ limit: 5 });
    expect(lastCall().path).toBe('/api/notifications?limit=5');
  });

  it('RF-005-02: getUnreadCount pide GET /api/notifications/unread-count', async () => {
    await getUnreadCount();
    expect(lastCall().path).toBe('/api/notifications/unread-count');
  });

  it('CA-005-22: markNotificationRead hace POST con el id codificado', async () => {
    await markNotificationRead(NOTIFICATION_ID);
    expect(lastCall()).toEqual({
      path: `/api/notifications/${NOTIFICATION_ID}/read`,
      options: { method: 'POST' },
    });
  });

  it('CA-005-22: markAllNotificationsRead hace POST a read-all', async () => {
    await markAllNotificationsRead();
    expect(lastCall()).toEqual({
      path: '/api/notifications/read-all',
      options: { method: 'POST' },
    });
  });

  it('CA-005-11, CA-005-32: getNotificationPreferences pide GET /api/notification-preferences', async () => {
    await getNotificationPreferences();
    expect(lastCall().path).toBe('/api/notification-preferences');
  });

  it('RF-005-17: updateNotificationPreferences hace PUT con los interruptores', async () => {
    const input = {
      email: { recordatorios: false, resoluciones: true, titular: true, grupo: true },
      telegram: { recordatorios: true, resoluciones: true, titular: true, grupo: true },
    };
    await updateNotificationPreferences(input);
    expect(lastCall()).toEqual({
      path: '/api/notification-preferences',
      options: { method: 'PUT', body: input },
    });
  });

  it('RF-005-28, CA-005-33: reactivateTelegram hace POST a su ruta del contrato', async () => {
    await reactivateTelegram();
    expect(lastCall()).toEqual({
      path: '/api/notification-preferences/telegram/reactivate',
      options: { method: 'POST' },
    });
  });

  it('RF-005-18, CA-005-13: unsubscribeEmail manda el token en el cuerpo de un POST', async () => {
    mockedRequest.mockResolvedValueOnce({ category: 'recordatorios' } as never);
    await expect(unsubscribeEmail('token-firmado')).resolves.toEqual({
      category: 'recordatorios',
    });
    expect(lastCall()).toEqual({
      path: '/api/notifications/unsubscribe',
      options: { method: 'POST', body: { token: 'token-firmado' } },
    });
  });
});
