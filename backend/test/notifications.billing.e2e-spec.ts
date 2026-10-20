import type {
  ChargeCancelled,
  ChargeConfirmed,
  ChargeGenerated,
  ChargeRejected,
  ChargeSubmitted,
  MemberRemovedForNonPayment,
} from '../src/shared/events/charge-events.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import {
  insertCharge,
  insertGroup,
  notificationsOf,
  publish,
  setName,
} from './support/notifications-fixtures.js';

// Spec 005 (T008, parte billing de T006): avisos de cobros. Requiere PostgreSQL.
describe('Notificaciones de cobros (spec 005)', () => {
  let t: AuthTestApp;
  let owner: TestUser;
  let member: TestUser;
  let groupId: string;
  let chargeId: string;

  beforeAll(async () => {
    t = await startAuthApp();
    owner = await t.createUser();
    member = await t.createUser();
    await setName(t, owner.id, 'Hilda Titular');
    await setName(t, member.id, 'Mario Miembro');
    groupId = await insertGroup(t, owner.id, [member.id]);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    await t.db.query('DELETE FROM charges');
    await t.db.query('DELETE FROM billing_cycles');
    chargeId = await insertCharge(t, groupId, owner.id, member.id, 3333);
  });

  const generated = (userId = member.id): ChargeGenerated => ({
    type: 'billing.charge-generated',
    chargeId,
    groupId,
    userId,
    period: '2026-10',
    amountCents: 3333,
    dueAt: new Date('2026-10-19T04:00:00Z'),
  });

  it('CA-005-01: el cobro generado avisa al miembro con monto, vencimiento y datos de pago', async () => {
    await publish(t, generated());
    const [n, ...rest] = await notificationsOf(t, member.id);
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({
      type: 'cobro_generado',
      category: 'recordatorios',
      link: `/cobros/${chargeId}`,
    });
    expect(n!.body).toContain('Bs 33,33');
    expect(n!.body).toContain('19 de octubre de 2026');
    expect(n!.body).toContain('Transferir a la cuenta 123');
  });

  it('RN-005-01: repetir el evento no duplica el aviso', async () => {
    await publish(t, generated());
    await publish(t, generated());
    expect(await notificationsOf(t, member.id)).toHaveLength(1);
  });

  it('RN-005-03: el titular no recibe avisos de cobro como miembro', async () => {
    await publish(t, generated(owner.id));
    expect(await notificationsOf(t, owner.id)).toHaveLength(0);
  });

  it('CA-005-07: el comprobante subido avisa al titular de inmediato, con el nombre del miembro', async () => {
    const event: ChargeSubmitted = {
      type: 'billing.charge-submitted',
      chargeId,
      groupId,
      userId: member.id,
      receiptId: '11111111-1111-4111-8111-111111111111',
      replaced: false,
    };
    await publish(t, event);
    const [n] = await notificationsOf(t, owner.id);
    expect(n).toMatchObject({ type: 'comprobante_subido', category: 'titular' });
    expect(n!.body).toContain('Mario Miembro');
    expect(n!.body).toContain('Bs 33,33');
    expect(await notificationsOf(t, member.id)).toHaveLength(0);
  });

  it('CA-005-09: el rechazo llega al miembro con el motivo', async () => {
    const event: ChargeRejected = {
      type: 'billing.charge-rejected',
      chargeId,
      groupId,
      userId: member.id,
      rejectedBy: owner.id,
      reason: 'Monto incorrecto',
      invalidReceipt: false,
      toStatus: 'pendiente',
    };
    await publish(t, event);
    const [n] = await notificationsOf(t, member.id);
    expect(n).toMatchObject({ type: 'pago_rechazado', category: 'resoluciones' });
    expect(n!.body).toContain('Monto incorrecto');
  });

  it('RF-005-07: la confirmación avisa al miembro y cancela los recordatorios pendientes', async () => {
    const reminder = await t.db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, category, title, body, dedupe_key, entity_type,
                                  entity_id)
       VALUES ($1, 'recordatorio_vencimiento', 'recordatorios', 'R', 'R', 'k-rec', 'charge', $2)
       RETURNING id`,
      [member.id, chargeId],
    );
    await t.db.query(
      `INSERT INTO notification_deliveries (notification_id, channel, status, respect_window, next_attempt_at)
       VALUES ($1, 'email', 'pending', true, now())`,
      [reminder.rows[0]!.id],
    );
    const event: ChargeConfirmed = {
      type: 'billing.charge-confirmed',
      chargeId,
      groupId,
      userId: member.id,
      confirmedBy: owner.id,
      settlement: 'comprobante',
    };
    await publish(t, event);
    const list = await notificationsOf(t, member.id);
    expect(list.map((n) => n.type)).toContain('pago_confirmado');
    const status = await t.db.query<{ status: string }>(
      'SELECT status FROM notification_deliveries WHERE notification_id = $1',
      [reminder.rows[0]!.id],
    );
    expect(status.rows[0]!.status).toBe('skipped');
  });

  it('RF-005-10: cancelar el cobro cancela los recordatorios pendientes sin avisar', async () => {
    const event: ChargeCancelled = {
      type: 'billing.charge-cancelled',
      chargeId,
      groupId,
      userId: member.id,
      cancelledBy: owner.id,
      reason: 'error',
    };
    await publish(t, event);
    expect(await notificationsOf(t, member.id)).toHaveLength(0);
  });

  it('CA-005-05: el retiro por mora avisa al miembro y al titular, un aviso por cobro', async () => {
    const event: MemberRemovedForNonPayment = {
      type: 'billing.member-removed-for-non-payment',
      groupId,
      userId: member.id,
      chargeId,
    };
    await publish(t, event);
    await publish(t, event);
    const memberList = await notificationsOf(t, member.id);
    expect(memberList.map((n) => n.type)).toEqual(['retiro_por_mora']);
    expect(memberList[0]!.body).toContain('Bs 33,33');
    const ownerList = await notificationsOf(t, owner.id);
    expect(ownerList.map((n) => n.type)).toEqual(['retiro_por_mora_titular']);
    expect(ownerList[0]).toMatchObject({ category: 'titular' });
    expect(ownerList[0]!.body).toContain('Mario Miembro');
  });
});
