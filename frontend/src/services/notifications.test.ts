import { apiRequest } from './http';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications';

// jest.setup.ts deja este módulo simulado para la campana de AppHeader; aquí se prueba el real.
jest.unmock('./notifications');
jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/notifications (contrato 005): centro de notificaciones', () => {
  it('RF-005-01: listNotifications hace GET /api/notifications sin filtros', async () => {
    const page = { items: [], nextCursor: null, unreadCount: 0 };
    mockedRequest.mockResolvedValue(page);
    await expect(listNotifications()).resolves.toBe(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/notifications');
  });

  it('RF-005-02: listNotifications manda unread, limit y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
    await listNotifications({ unread: true, limit: 20, cursor: 'abc' });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/notifications?unread=true&limit=20&cursor=abc',
    );
  });

  it('RF-005-02: getUnreadCount hace GET /api/notifications/unread-count', async () => {
    mockedRequest.mockResolvedValue({ unreadCount: 3 });
    await expect(getUnreadCount()).resolves.toEqual({ unreadCount: 3 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/notifications/unread-count');
  });

  it('RF-005-02: markNotificationRead hace POST /api/notifications/:id/read con el id codificado', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await markNotificationRead('n/1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/notifications/n%2F1/read', {
      method: 'POST',
    });
  });

  it('CA-005-22: markAllNotificationsRead hace POST /api/notifications/read-all', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await markAllNotificationsRead();
    expect(mockedRequest).toHaveBeenCalledWith('/api/notifications/read-all', {
      method: 'POST',
    });
  });
});
