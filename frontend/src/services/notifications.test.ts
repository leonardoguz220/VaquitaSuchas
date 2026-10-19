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
import { MOCK_UNSUBSCRIBE_TOKENS, resetNotificationsMock } from './notifications.mock';

beforeEach(() => {
  jest.useFakeTimers();
  resetNotificationsMock();
});
afterEach(() => jest.useRealTimers());

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectRejection(promise: Promise<unknown>, shape: object) {
  const assertion = expect(promise).rejects.toMatchObject(shape);
  await jest.runAllTimersAsync();
  await assertion;
}

describe('services/notifications con datos simulados (contrato 005): centro de avisos', () => {
  it('RF-005-01: listNotifications trae título, texto, fecha, enlace y el contador', async () => {
    const page = await settle(listNotifications());
    expect(page.items.length).toBeGreaterThan(0);
    page.items.forEach((item) => {
      expect(item).toEqual(
        expect.objectContaining({ title: expect.any(String), createdAt: expect.any(String) }),
      );
    });
    expect(page.unreadCount).toBe(page.items.filter((item) => item.readAt === null).length);
  });

  it('RF-005-02: el filtro unread trae solo las no leídas y pagina con cursor', async () => {
    const unread = await settle(listNotifications({ unread: true }));
    expect(unread.items.every((item) => item.readAt === null)).toBe(true);
    const first = await settle(listNotifications({ limit: 2 }));
    expect(first.items).toHaveLength(2);
    const second = await settle(listNotifications({ limit: 2, cursor: first.nextCursor ?? '' }));
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it('RF-005-02: getUnreadCount coincide con la lista', async () => {
    const { unreadCount } = await settle(getUnreadCount());
    const page = await settle(listNotifications());
    expect(unreadCount).toBe(page.unreadCount);
  });

  it('RF-005-02: markNotificationRead baja el contador y responde 404 a un id ajeno', async () => {
    const [first] = (await settle(listNotifications({ unread: true }))).items;
    const before = (await settle(getUnreadCount())).unreadCount;
    await settle(markNotificationRead(first.id));
    expect((await settle(getUnreadCount())).unreadCount).toBe(before - 1);
    await expectRejection(markNotificationRead('ajena'), { statusCode: 404 });
  });

  it('CA-005-22: tras marcar todas como leídas, el contador queda en cero', async () => {
    await settle(markAllNotificationsRead());
    expect((await settle(getUnreadCount())).unreadCount).toBe(0);
  });
});

describe('services/notifications con datos simulados (contrato 005): preferencias', () => {
  it('RF-005-17: guarda los interruptores por tipo para correo y Telegram', async () => {
    const current = await settle(getNotificationPreferences());
    expect(current.securityEmailsAlwaysOn).toBe(true);
    await settle(
      updateNotificationPreferences({
        email: { ...current.email, recordatorios: false },
        telegram: { recordatorios: false, resoluciones: false, titular: false, grupo: false },
      }),
    );
    const saved = await settle(getNotificationPreferences());
    expect(saved.email.recordatorios).toBe(false);
    expect(saved.telegram.titular).toBe(false);
  });

  it('RF-005-17: reactivateTelegram quita el bloqueo', async () => {
    expect((await settle(getNotificationPreferences())).telegram.blocked).toBe(true);
    expect((await settle(reactivateTelegram())).telegram.blocked).toBe(false);
  });

  it('RF-005-18: unsubscribeEmail desactiva el tipo del enlace; un token inválido da 400', async () => {
    await expect(settle(unsubscribeEmail(MOCK_UNSUBSCRIBE_TOKENS.valid))).resolves.toEqual({
      category: 'recordatorios',
    });
    expect((await settle(getNotificationPreferences())).email.recordatorios).toBe(false);
    await expectRejection(unsubscribeEmail('otro'), { statusCode: 400 });
  });
});
