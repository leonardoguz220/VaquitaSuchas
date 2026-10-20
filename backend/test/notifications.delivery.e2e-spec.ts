import { jest } from '@jest/globals';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { ChargeSubmitted } from '../src/shared/events/charge-events.js';
import {
  MailDeliveryError,
  MailService,
  type MailMessage,
} from '../src/shared/ports/mail.service.js';
import { DeliveryService } from '../src/modules/notifications/services/delivery.service.js';
import {
  NotificationService,
  type NotifyInput,
} from '../src/modules/notifications/services/notification.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import { insertCharge, insertGroup, publish, setName } from './support/notifications-fixtures.js';

// Spec 005 (T019, T020): buzón de salida de correo, preferencias, ventana y reintentos.
// Requiere PostgreSQL. El proveedor de correo se simula con un espía sobre `MailService`.
// 12:00 UTC = 08:00 en La Paz; 01:00 UTC = 21:00 del día anterior.
describe('Entrega de correos de avisos (spec 005)', () => {
  let t: AuthTestApp;
  let owner: TestUser;
  let member: TestUser;
  let groupId: string;
  let chargeId: string;
  let notifications: NotificationService;
  let delivery: DeliveryService;
  let send: jest.SpiedFunction<MailService['send']>;
  const sent = (): MailMessage[] => send.mock.calls.map((c) => c[0]);

  beforeAll(async () => {
    t = await startAuthApp({ clock: new FakeClock('2026-10-20T15:00:00Z') });
    notifications = t.app.get(NotificationService);
    delivery = t.app.get(DeliveryService);
    send = jest.spyOn(t.app.get(MailService), 'send');
    owner = await t.createUser();
    member = await t.createUser({ email: 'miembro-avisos@example.com' });
    await setName(t, member.id, 'Mario Miembro');
    groupId = await insertGroup(t, owner.id, [member.id]);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query('DELETE FROM notification_preferences');
    await t.db.query("UPDATE users SET status = 'activo'");
    await t.db.query('DELETE FROM charges');
    await t.db.query('DELETE FROM billing_cycles');
    chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
  });

  const notify = (input: NotifyInput): Promise<boolean> =>
    t.app.get(DbService).withTransaction((tx) => notifications.notify(tx, input));
  const reminder = (): NotifyInput => ({
    userId: member.id,
    type: 'recordatorio_vencimiento',
    entity: { type: 'charge', id: chargeId },
    data: {
      groupName: 'Netflix Familiar',
      chargeId,
      amountCents: 3333,
      dueAt: new Date('2026-10-21T04:00:00Z'),
    },
  });
  const newRequest = (): NotifyInput => ({
    userId: owner.id,
    type: 'solicitud_nueva',
    entity: { type: 'request', id: chargeId },
    data: { groupName: 'Netflix Familiar', personName: 'Mario Miembro', requestId: chargeId },
  });
  const deliveryRows = async () =>
    (
      await t.db.query<{
        status: string;
        attempts: number;
        skip_reason: string | null;
        respect_window: boolean;
        next_attempt_at: Date;
        last_error: string | null;
        channel: string;
      }>(
        `SELECT status, attempts, skip_reason, respect_window, next_attempt_at, last_error, channel
           FROM notification_deliveries WHERE channel = 'email' ORDER BY created_at`,
      )
    ).rows;
  const visibleCount = async (userId: string): Promise<number> =>
    (await t.db.query('SELECT 1 FROM notifications WHERE user_id = $1', [userId])).rowCount ?? 0;

  it('el aviso crea un envío de correo pendiente en la misma transacción que la notificación', async () => {
    await notify(reminder());
    expect(await deliveryRows()).toEqual([
      expect.objectContaining({ channel: 'email', status: 'pending', respect_window: true }),
    ]);
  });

  it('CA-005-11: con los correos de recordatorios desactivados solo se ve en la app', async () => {
    await t.db.query(
      'INSERT INTO notification_preferences (user_id, email_recordatorios) VALUES ($1, false)',
      [member.id],
    );
    await notify(reminder());
    expect(await visibleCount(member.id)).toBe(1);
    expect(await deliveryRows()).toEqual([
      expect.objectContaining({ status: 'skipped', skip_reason: 'preferencia_desactivada' }),
    ]);
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    expect(send).not.toHaveBeenCalled();
  });

  it('RN-005-04: un usuario suspendido no recibe correos, ni aunque se suspenda después del aviso', async () => {
    await notify(reminder());
    await t.db.query("UPDATE users SET status = 'suspendido' WHERE id = $1", [member.id]);
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    expect(send).not.toHaveBeenCalled();
    expect(await deliveryRows()).toEqual([
      expect.objectContaining({ status: 'skipped', skip_reason: 'usuario_suspendido' }),
    ]);
    await notify({ ...reminder(), type: 'cobro_generado', period: '2026-10' });
    expect((await deliveryRows()).at(-1)).toMatchObject({ skip_reason: 'usuario_suspendido' });
  });

  it('RF-005-17: si desactiva el correo antes del envío, la tarea lo vuelve a comprobar', async () => {
    await notify(reminder());
    await t.db.query(
      'UPDATE notification_preferences SET email_recordatorios = false WHERE user_id = $1',
      [member.id],
    );
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    expect(send).not.toHaveBeenCalled();
    expect((await deliveryRows())[0]).toMatchObject({ skip_reason: 'preferencia_desactivada' });
  });

  it('CA-005-24: un recordatorio de las 21:00 de La Paz espera a la ventana de las 08:00', async () => {
    await notify(reminder());
    await delivery.deliver(new Date('2026-10-21T01:00:00Z'));
    expect(send).not.toHaveBeenCalled();
    const [pending] = await deliveryRows();
    expect(pending).toMatchObject({ status: 'pending', attempts: 0 });
    expect(pending!.next_attempt_at.toISOString()).toBe('2026-10-21T12:00:00.000Z');

    await delivery.deliver(new Date('2026-10-21T11:59:00Z'));
    expect(send).not.toHaveBeenCalled();
    await delivery.deliver(new Date('2026-10-21T12:00:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await deliveryRows())[0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('CA-005-29: el aviso de una solicitud a las 21:00 se envía sin esperar la ventana', async () => {
    await notify(newRequest());
    expect((await deliveryRows())[0]).toMatchObject({ respect_window: false });
    await delivery.deliver(new Date('2026-10-21T01:00:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(sent()[0]!.subject).toContain('Netflix Familiar');
  });

  it('CA-005-13: el correo incluye el enlace de desactivación y el de la app', async () => {
    await notify(reminder());
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    const [mail] = sent();
    expect(mail!.to).toBe('miembro-avisos@example.com');
    expect(mail!.text).toMatch(/\/avisos\/desactivar\?token=[^\s]+/);
    expect(mail!.html).toContain('/avisos/desactivar?token=');
    expect(mail!.text).toContain(`/cobros/${chargeId}`);
  });

  it('CA-005-19: con el proveedor caído la operación se completa y el correo queda en reintentos', async () => {
    send.mockRejectedValue(new MailDeliveryError('proveedor caído'));
    const event: ChargeSubmitted = {
      type: 'billing.charge-submitted',
      chargeId,
      groupId,
      userId: member.id,
      receiptId: '11111111-1111-4111-8111-111111111111',
      replaced: false,
    };
    // Publicar el hecho (subir el comprobante) no toca el proveedor de correo.
    await publish(t, event);
    expect(send).not.toHaveBeenCalled();
    expect(await visibleCount(owner.id)).toBe(1);

    const now = new Date('2026-10-20T15:00:00Z');
    await expect(delivery.deliver(now)).resolves.toBe(2); // correo + Telegram
    const [row] = await deliveryRows();
    expect(row).toMatchObject({ status: 'pending', attempts: 1, last_error: 'MailDeliveryError' });
    expect(row!.next_attempt_at.toISOString()).toBe('2026-10-20T15:05:00.000Z');
    // No se registran direcciones ni textos del aviso en el error guardado.
    expect(row!.last_error).not.toContain('@');
  });

  it('CA-005-20: agotados los reintentos (5 min, 30 min, 2 h) queda failed y el aviso sigue visible', async () => {
    send.mockRejectedValue(new MailDeliveryError('proveedor caído'));
    await notify(reminder());
    const starts = [
      '2026-10-20T15:00:00Z',
      '2026-10-20T15:05:00Z',
      '2026-10-20T15:35:00Z',
      '2026-10-20T17:35:00Z',
    ];
    for (const at of starts) {
      await delivery.deliver(new Date(at));
    }
    expect(send).toHaveBeenCalledTimes(4);
    expect(await deliveryRows()).toEqual([
      expect.objectContaining({ status: 'failed', attempts: 4 }),
    ]);
    expect(await visibleCount(member.id)).toBe(1);
    // Un envío fallido ya no se vuelve a intentar.
    await delivery.deliver(new Date('2026-10-21T15:00:00Z'));
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('CA-005-20: no reintenta antes de tiempo', async () => {
    send.mockRejectedValue(new MailDeliveryError('proveedor caído'));
    await notify(reminder());
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    await delivery.deliver(new Date('2026-10-20T15:04:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('RNF-005-01: dos ejecuciones simultáneas de la tarea no envían el mismo correo dos veces', async () => {
    send.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 150)));
    await notify(reminder());
    const now = new Date('2026-10-20T15:00:00Z');
    await Promise.all([delivery.deliver(now), delivery.deliver(now)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await deliveryRows())[0]).toMatchObject({ status: 'sent' });
  });

  it('RN-005-02: un aviso cancelado (cobro pagado) no se envía', async () => {
    await notify(reminder());
    await t.db.query(
      "UPDATE notification_deliveries SET status = 'skipped', skip_reason = 'aviso_cancelado'",
    );
    await delivery.deliver(new Date('2026-10-20T15:00:00Z'));
    expect(send).not.toHaveBeenCalled();
  });

  it('CA-005-12: el correo de seguridad sale por MailService aunque se hayan desactivado los demás', async () => {
    const user = await t.createUser({ email: 'seguridad-avisos@example.com' });
    await t.db.query(
      `INSERT INTO notification_preferences (user_id, email_recordatorios, email_resoluciones,
                                             email_titular, email_grupo)
       VALUES ($1, false, false, false, false)`,
      [user.id],
    );
    const response = await t
      .http()
      .post('/auth/password/forgot')
      .set('X-Forwarded-For', '10.9.9.9')
      .send({ email: user.email });
    expect(response.status).toBe(202);
    expect(sent().map((m) => m.to)).toContain('seguridad-avisos@example.com');
    // No pasa por el buzón de avisos ni por las preferencias.
    expect(await deliveryRows()).toHaveLength(0);
  });
});
