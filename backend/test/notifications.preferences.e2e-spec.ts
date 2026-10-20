import { jest } from '@jest/globals';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { DbService } from '../src/shared/db/db.service.js';
import { MailService, type MailMessage } from '../src/shared/ports/mail.service.js';
import { DeliveryService } from '../src/modules/notifications/services/delivery.service.js';
import { NotificationService } from '../src/modules/notifications/services/notification.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';

// Spec 005 (T019, T021): preferencias de aviso y desactivación desde el correo. Requiere PostgreSQL.
describe('Preferencias de avisos (spec 005)', () => {
  let t: AuthTestApp;
  let ana: TestUser;
  let beto: TestUser;
  let anaAuth: string;
  let send: jest.SpiedFunction<MailService['send']>;
  const sent = (): MailMessage[] => send.mock.calls.map((c) => c[0]);

  beforeAll(async () => {
    t = await startAuthApp({ clock: new FakeClock('2026-10-20T15:00:00Z') });
    send = jest.spyOn(t.app.get(MailService), 'send').mockResolvedValue(undefined);
    ana = await t.createUser();
    beto = await t.createUser();
    anaAuth = `Bearer ${(await t.login(ana.email, ana.password)).body.sessionToken as string}`;
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    send.mockClear();
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query('DELETE FROM notification_preferences');
  });

  const getPrefs = (auth = anaAuth) =>
    t.http().get('/notification-preferences').set('Authorization', auth);
  const putPrefs = (body: unknown, auth = anaAuth) =>
    t
      .http()
      .put('/notification-preferences')
      .set('Authorization', auth)
      .send(body as object);
  const unsubscribe = (token: unknown) =>
    t.http().post('/notifications/unsubscribe').send({ token });
  const notifyReminder = (userId: string, key: string) =>
    t.app.get(DbService).withTransaction((tx) =>
      t.app.get(NotificationService).notify(tx, {
        userId,
        type: 'aviso_previo',
        entity: { type: 'group', id: '11111111-1111-4111-8111-111111111111' },
        period: key,
        data: {
          groupName: 'Netflix',
          groupId: '11111111-1111-4111-8111-111111111111',
          amountCents: 3333,
        },
      }),
    );
  /** Token del enlace de desactivación del último correo enviado. */
  const tokenFromLastMail = (): string => {
    const text = sent().at(-1)!.text;
    const url = /https?:\/\/\S+\/avisos\/desactivar\?token=(\S+)/.exec(text);
    return decodeURIComponent(url![1]!);
  };

  it('RF-005-17: sin sesión no se leen ni cambian las preferencias', async () => {
    expect((await t.http().get('/notification-preferences')).status).toBe(401);
    expect((await t.http().put('/notification-preferences').send({})).status).toBe(401);
  });

  it('RF-005-17: por defecto todos los interruptores de correo y Telegram están encendidos', async () => {
    const res = await getPrefs();
    expect(res.status).toBe(200);
    const on = { recordatorios: true, resoluciones: true, titular: true, grupo: true };
    expect(res.body).toEqual({
      email: on,
      telegram: { ...on, blocked: false },
      emailProblem: false,
      securityEmailsAlwaysOn: true,
    });
  });

  it('CA-005-11: PUT cambia solo los interruptores enviados y no toca los de otra persona', async () => {
    const res = await putPrefs({ email: { recordatorios: false } });
    expect(res.status).toBe(200);
    expect(res.body.email).toEqual({
      recordatorios: false,
      resoluciones: true,
      titular: true,
      grupo: true,
    });
    expect((await getPrefs()).body.email.recordatorios).toBe(false);
    const betoAuth = `Bearer ${(await t.login(beto.email, beto.password)).body.sessionToken as string}`;
    expect((await getPrefs(betoAuth)).body.email.recordatorios).toBe(true);
  });

  it('RF-005-03: no existe un campo para desactivar la app y los valores deben ser booleanos', async () => {
    expect((await putPrefs({ email: { recordatorios: 'no' } })).status).toBe(400);
    const res = await putPrefs({ app: false, email: { grupo: false } });
    expect(res.status).toBe(400);
    expect((await getPrefs()).body.email.grupo).toBe(true);
  });

  it('CA-005-13: el enlace del correo desactiva ese tipo con un POST y el siguiente aviso no sale por correo', async () => {
    await notifyReminder(ana.id, '2026-10');
    await t.app.get(DeliveryService).deliver(new Date('2026-10-20T15:00:00Z'));
    expect(sent()).toHaveLength(1);

    const token = tokenFromLastMail();
    const res = await unsubscribe(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: 'recordatorios' });
    expect((await getPrefs()).body.email).toMatchObject({ recordatorios: false, titular: true });

    // Repetirlo es inocuo.
    expect((await unsubscribe(token)).status).toBe(200);

    await notifyReminder(ana.id, '2026-11');
    await t.app.get(DeliveryService).deliver(new Date('2026-10-20T15:00:00Z'));
    expect(sent()).toHaveLength(1);
    const visible = await t.db.query('SELECT 1 FROM notifications WHERE user_id = $1', [ana.id]);
    expect(visible.rowCount).toBe(2);
  });

  it('CA-005-13: el GET de la página no cambia nada (la confirmación es un POST)', async () => {
    await notifyReminder(ana.id, '2026-10');
    await t.app.get(DeliveryService).deliver(new Date('2026-10-20T15:00:00Z'));
    const token = tokenFromLastMail();
    const get = await t.http().get(`/notifications/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(get.status).toBe(404);
    expect((await getPrefs()).body.email.recordatorios).toBe(true);
  });

  it('CA-005-13: un token inválido, alterado o de otra categoría responde 400 sin cambiar nada', async () => {
    await notifyReminder(ana.id, '2026-10');
    await t.app.get(DeliveryService).deliver(new Date('2026-10-20T15:00:00Z'));
    const token = tokenFromLastMail();
    for (const bad of [
      'basura',
      `${token}x`,
      token.replace('recordatorios', 'titular'),
      token.replace(ana.id, beto.id),
      '',
      undefined,
      12,
    ]) {
      const res = await unsubscribe(bad);
      expect(res.status).toBe(400);
      expect(res.body.error?.code ?? res.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await getPrefs()).body.email.recordatorios).toBe(true);
    const betoRow = await t.db.query('SELECT 1 FROM notification_preferences WHERE user_id = $1', [
      beto.id,
    ]);
    expect(betoRow.rowCount).toBe(0);
  });
});
