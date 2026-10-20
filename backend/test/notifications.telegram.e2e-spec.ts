import { jest } from '@jest/globals';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { ChargeSubmitted } from '../src/shared/events/charge-events.js';
import { MailService } from '../src/shared/ports/mail.service.js';
import { DeliveryService } from '../src/modules/notifications/services/delivery.service.js';
import {
  NotificationService,
  type NotifyInput,
} from '../src/modules/notifications/services/notification.service.js';
import { PreferencesService } from '../src/modules/notifications/services/preferences.service.js';
import {
  TelegramBotBlockedError,
  TelegramDeliveryError,
  TelegramGateway,
} from '../src/modules/telegram/ports/telegram.gateway.js';
import { DevTelegramGateway } from '../src/modules/telegram/services/dev-telegram.gateway.js';
import { TelegramWebhookService } from '../src/modules/telegram/services/telegram-webhook.service.js';
import { startAuthApp, tokenFromUrl, type AuthTestApp, type TestUser } from './support/auth-app.js';
import { insertCharge, insertGroup, publish, setName } from './support/notifications-fixtures.js';

// Spec 005 (T029, T030): canal de Telegram con el bot simulado de la spec 000 (DevTelegramGateway).
// Requiere PostgreSQL. 15:00 UTC = 11:00 en La Paz, dentro de la ventana de envío.
describe('Avisos por Telegram (spec 005)', () => {
  const NOW = new Date('2026-10-20T15:00:00Z');
  let t: AuthTestApp;
  let owner: TestUser;
  let member: TestUser;
  let groupId: string;
  let chargeId: string;
  let bot: DevTelegramGateway;
  let notifications: NotificationService;
  let delivery: DeliveryService;
  let webhook: TelegramWebhookService;
  let updateSeq = 900_000;

  beforeAll(async () => {
    t = await startAuthApp({ clock: new FakeClock(NOW.toISOString()) });
    bot = t.app.get(TelegramGateway) as DevTelegramGateway;
    notifications = t.app.get(NotificationService);
    delivery = t.app.get(DeliveryService);
    webhook = t.app.get(TelegramWebhookService);
    jest.spyOn(t.app.get(MailService), 'send').mockResolvedValue(undefined);
    owner = await t.createUser();
    member = await t.createUser();
    await setName(t, member.id, 'Mario Miembro');
    groupId = await insertGroup(t, owner.id, [member.id]);
  }, 60_000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query('DELETE FROM notification_preferences');
    await t.db.query('DELETE FROM charges');
    await t.db.query('DELETE FROM billing_cycles');
    chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
  });

  const chatOf = async (userId: string): Promise<number> =>
    Number(
      (await t.db.query('SELECT telegram_user_id FROM users WHERE id = $1', [userId])).rows[0]
        .telegram_user_id,
    );
  const notify = (input: NotifyInput): Promise<boolean> =>
    t.app.get(DbService).withTransaction((tx) => notifications.notify(tx, input));
  const newCharge = (userId: string): NotifyInput => ({
    userId,
    type: 'cobro_generado',
    entity: { type: 'charge', id: chargeId },
    data: {
      groupName: 'Netflix Familiar',
      groupId,
      chargeId,
      amountCents: 3333,
      dueAt: new Date('2026-10-21T04:00:00Z'),
      paymentInfo: 'Transferir a la cuenta 123',
    },
  });
  const channelRows = async (channel = 'telegram') =>
    (
      await t.db.query<{ status: string; attempts: number; skip_reason: string | null }>(
        'SELECT status, attempts, skip_reason FROM notification_deliveries WHERE channel = $1 ORDER BY created_at',
        [channel],
      )
    ).rows;
  const sessionOf = async (user: TestUser) =>
    `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
  const blockBot = (telegramUserId: number) =>
    webhook.process({
      update_id: (updateSeq += 1),
      my_chat_member: {
        from: { id: telegramUserId },
        chat: { id: telegramUserId },
        new_chat_member: { status: 'kicked' },
      },
    });

  it('CA-005-30: al verificar el celular al registrarse recibe avisos por Telegram sin hacer nada más', async () => {
    const res = await t.register();
    expect(res.status).toBe(201);
    const telegramUserId = 61_001;
    await t.verifyWithTelegram({
      telegramUserId,
      token: tokenFromUrl(res.body.verification.telegramUrl),
      phoneNumber: '+59175550001',
    });
    const user = await t.db.query<{ id: string }>(
      'SELECT id FROM users WHERE telegram_user_id = $1',
      [telegramUserId],
    );
    const userId = user.rows[0]!.id;
    await notify(newCharge(userId));

    await delivery.deliver(NOW);

    const text = bot.messagesFor(telegramUserId).map((m) => m.text);
    expect(text.some((m) => m.includes('Tienes un nuevo cobro en Vaquita.'))).toBe(true);
    expect(await channelRows()).toEqual([expect.objectContaining({ status: 'sent' })]);
  });

  it('CA-005-31: al cambiar el celular con el bot, los avisos van a la nueva cuenta de Telegram', async () => {
    const user = await t.createUser();
    const oldChat = await chatOf(user.id);
    const auth = await sessionOf(user);
    const started = await t
      .http()
      .post('/users/me/phone-change')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '10.5.0.1')
      .send();
    expect(started.status).toBe(201);
    const newChat = 61_002;
    await t.verifyWithTelegram({
      telegramUserId: newChat,
      token: tokenFromUrl(started.body.verification.telegramUrl),
      phoneNumber: '+59175550002',
    });
    const before = bot.messagesFor(oldChat).length;
    await notify(newCharge(user.id));

    await delivery.deliver(NOW);

    const notices = bot
      .messagesFor(newChat)
      .filter((m) => m.text.includes('Tienes un nuevo cobro en Vaquita.'));
    expect(notices).toHaveLength(1);
    expect(bot.messagesFor(oldChat)).toHaveLength(before);
  });

  it('CA-005-32: el mensaje de Telegram no lleva montos, motivos ni datos de pago; desactivado solo se ve en la app', async () => {
    const chat = await chatOf(member.id);
    const before = bot.messagesFor(chat).length;
    await notify(newCharge(member.id));
    await delivery.deliver(NOW);
    const message = bot.messagesFor(chat)[before]!.text;
    expect(message).toContain(`/cobros/${chargeId}`);
    expect(message).not.toMatch(/Bs|33,33|cuenta 123|Netflix/);

    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query(
      'INSERT INTO notification_preferences (user_id, telegram_resoluciones) VALUES ($1, false) ON CONFLICT (user_id) DO UPDATE SET telegram_resoluciones = false',
      [member.id],
    );
    await notify({ ...newCharge(member.id), type: 'pago_confirmado' });
    await delivery.deliver(NOW);
    expect(bot.messagesFor(chat)).toHaveLength(before + 1);
    expect(await channelRows()).toEqual([
      expect.objectContaining({ status: 'skipped', skip_reason: 'preferencia_desactivada' }),
    ]);
    expect(
      (await t.db.query('SELECT 1 FROM notifications WHERE user_id = $1', [member.id])).rowCount,
    ).toBe(1);
  });

  it('CA-005-33: al bloquear el bot se corta el canal, el celular sigue verificado y se puede reactivar', async () => {
    const chat = await chatOf(member.id);
    await notify(newCharge(member.id));
    await blockBot(chat);
    const before = bot.messagesFor(chat).length;

    await delivery.deliver(NOW);

    expect(bot.messagesFor(chat)).toHaveLength(before);
    expect(await channelRows()).toEqual([
      expect.objectContaining({ status: 'skipped', skip_reason: 'telegram_bloqueado' }),
    ]);
    const verified = await t.db.query('SELECT verified_at, phone_e164 FROM users WHERE id = $1', [
      member.id,
    ]);
    expect(verified.rows[0].verified_at).not.toBeNull();
    expect(verified.rows[0].phone_e164).not.toBeNull();
    expect(
      (await t.db.query('SELECT 1 FROM notifications WHERE user_id = $1', [member.id])).rowCount,
    ).toBe(1);

    const auth = await sessionOf(member);
    const prefs = await t.http().get('/notification-preferences').set('Authorization', auth);
    expect(prefs.body.telegram.blocked).toBe(true);
    const reactivated = await t
      .http()
      .post('/notification-preferences/telegram/reactivate')
      .set('Authorization', auth);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.telegram.blocked).toBe(false);

    await notify({ ...newCharge(member.id), type: 'pago_confirmado' });
    await delivery.deliver(NOW);
    expect(bot.messagesFor(chat)).toHaveLength(before + 1);
  });

  it('CA-005-33: un envío rechazado por bot bloqueado marca telegram_blocked_at', async () => {
    const chat = await chatOf(member.id);
    const spy = jest.spyOn(bot, 'sendMessage').mockRejectedValue(new TelegramBotBlockedError());
    await notify(newCharge(member.id));

    await delivery.deliver(NOW);
    spy.mockRestore();

    expect(await channelRows()).toEqual([expect.objectContaining({ status: 'skipped' })]);
    const row = await t.db.query(
      'SELECT telegram_blocked_at FROM notification_preferences WHERE user_id = $1',
      [member.id],
    );
    expect(row.rows[0].telegram_blocked_at).not.toBeNull();
    expect(bot.messagesFor(chat).length).toBeGreaterThanOrEqual(0);
  });

  it('CA-005-34: con Telegram caído subir el comprobante se completa y el mensaje queda en reintentos', async () => {
    const spy = jest
      .spyOn(bot, 'sendMessage')
      .mockRejectedValue(new TelegramDeliveryError('Telegram caído'));
    const event: ChargeSubmitted = {
      type: 'billing.charge-submitted',
      chargeId,
      groupId,
      userId: member.id,
      receiptId: '11111111-1111-4111-8111-111111111111',
      replaced: false,
    };
    await publish(t, event);
    expect(spy).not.toHaveBeenCalled();
    expect(
      (await t.db.query('SELECT 1 FROM notifications WHERE user_id = $1', [owner.id])).rowCount,
    ).toBe(1);

    await delivery.deliver(NOW);
    spy.mockRestore();

    expect(await channelRows()).toEqual([
      expect.objectContaining({ status: 'pending', attempts: 1 }),
    ]);
  });

  it('RF-005-17: un rebote permanente del correo deja de enviar correos a esa persona', async () => {
    await t.app.get(PreferencesService).markEmailBounced(member.id);
    await notify(newCharge(member.id));
    expect(await channelRows('email')).toEqual([
      expect.objectContaining({ status: 'skipped', skip_reason: 'correo_rebotado' }),
    ]);
    const prefs = await t.app.get(PreferencesService).get(member.id);
    expect(prefs.emailProblem).toBe(true);
  });
});
