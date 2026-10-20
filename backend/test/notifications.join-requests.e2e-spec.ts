import { randomUUID } from 'node:crypto';
import type {
  ChatMessageSent,
  DecisionReminderDue,
  DisputeOpened,
  DisputeResolved,
  JoinRequestAccepted,
  JoinRequestExpired,
  JoinRequestOpened,
  JoinRequestRejected,
  PaymentDataSent,
  ProofSubmitted,
} from '../src/shared/events/join-request-events.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import {
  insertGroup,
  insertRequest,
  notificationsOf,
  publish,
  setName,
} from './support/notifications-fixtures.js';

// Spec 005 (T010): avisos de las solicitudes de ingreso (spec 010). Requiere PostgreSQL.
describe('Notificaciones de solicitudes de ingreso (spec 005)', () => {
  let t: AuthTestApp;
  let host: TestUser;
  let applicant: TestUser;
  let groupId: string;
  let requestId: string;

  beforeAll(async () => {
    t = await startAuthApp();
    host = await t.createUser();
    await setName(t, host.id, 'Hilda Titular');
    groupId = await insertGroup(t, host.id, []);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
    // Un solicitante nuevo por prueba: solo puede haber una solicitud activa por persona y grupo.
    applicant = await t.createUser();
    await setName(t, applicant.id, 'Carlos Solicitante');
    requestId = await insertRequest(t, groupId, applicant.id, 'Cuenta 555');
  });

  const base = () => ({ requestId, groupId, applicantId: applicant.id, hostId: host.id });

  it('CA-005-25: la solicitud nueva avisa al titular con el nombre del solicitante', async () => {
    const event: JoinRequestOpened = {
      type: 'join-requests.opened',
      ...base(),
      source: 'codigo',
      listingId: null,
    };
    await publish(t, event);
    const [n, ...rest] = await notificationsOf(t, host.id);
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({
      type: 'solicitud_nueva',
      category: 'titular',
      link: `/solicitudes/${requestId}`,
    });
    expect(n!.body).toContain('Carlos Solicitante');
    expect(await notificationsOf(t, applicant.id)).toHaveLength(0);
  });

  it('CA-005-25: repetir el evento no duplica el aviso', async () => {
    const event: JoinRequestOpened = {
      type: 'join-requests.opened',
      ...base(),
      source: 'codigo',
      listingId: null,
    };
    await publish(t, event);
    await publish(t, event);
    expect(await notificationsOf(t, host.id)).toHaveLength(1);
  });

  it('CA-005-26: los datos de pago llegan al solicitante con el monto y 15 minutos', async () => {
    const event: PaymentDataSent = {
      type: 'join-requests.payment-data-sent',
      ...base(),
      amountCents: 2550,
      payDeadlineAt: new Date(Date.now() + 15 * 60_000),
    };
    await publish(t, event);
    const [n] = await notificationsOf(t, applicant.id);
    expect(n).toMatchObject({ type: 'solicitud_datos_pago', category: 'grupo' });
    expect(n!.body).toContain('Bs 25,50');
    expect(n!.body).toContain('15 minutos');
    expect(n!.body).toContain('Cuenta 555');
  });

  it('CA-005-26: el comprobante enviado avisa al titular con su plazo de decisión', async () => {
    const event: ProofSubmitted = {
      type: 'join-requests.proof-submitted',
      ...base(),
      decisionDeadlineAt: new Date(Date.now() + 60 * 60_000),
    };
    await publish(t, event);
    const [n] = await notificationsOf(t, host.id);
    expect(n).toMatchObject({ type: 'solicitud_comprobante', category: 'titular' });
    expect(n!.body).toContain('Carlos Solicitante');
    expect(n!.body).toContain('60 minutos');
  });

  it('CA-005-27: a los 30 minutos el titular recibe un solo recordatorio', async () => {
    const event: DecisionReminderDue = {
      type: 'join-requests.decision-reminder-due',
      ...base(),
      decisionDeadlineAt: new Date(Date.now() + 30 * 60_000),
    };
    await publish(t, event);
    await publish(t, event);
    const list = await notificationsOf(t, host.id);
    expect(list.map((n) => n.type)).toEqual(['solicitud_recordatorio_30']);
  });

  it('CA-005-28: los mensajes sin leer se agrupan en un solo aviso por tanda', async () => {
    const message = (): ChatMessageSent => ({
      type: 'join-requests.chat-message-sent',
      ...base(),
      messageId: randomUUID(),
      senderId: applicant.id,
      recipientId: host.id,
    });
    await publish(t, message());
    await publish(t, message());
    await publish(t, message());
    let list = await notificationsOf(t, host.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'solicitud_mensaje', category: 'titular' });
    expect(list[0]!.body).not.toContain('Hola');

    // El titular lee el chat: la siguiente tanda sí genera un aviso nuevo.
    await t.db.query(
      `INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, 'Hola') RETURNING seq`,
      [requestId, applicant.id],
    );
    await t.db.query(
      `INSERT INTO join_request_reads (request_id, user_id, last_read_seq)
       SELECT $1, $2, max(seq) FROM join_messages WHERE request_id = $1`,
      [requestId, host.id],
    );
    await publish(t, message());
    list = await notificationsOf(t, host.id);
    expect(list).toHaveLength(2);
  });

  it('CA-005-28: el solicitante recibe el aviso de chat con categoría de grupo', async () => {
    const event: ChatMessageSent = {
      type: 'join-requests.chat-message-sent',
      ...base(),
      messageId: randomUUID(),
      senderId: host.id,
      recipientId: applicant.id,
    };
    await publish(t, event);
    const [n] = await notificationsOf(t, applicant.id);
    expect(n).toMatchObject({ type: 'solicitud_mensaje', category: 'grupo' });
    expect(n!.title).toContain('Hilda Titular');
  });

  it('RF-005-23: aceptada, rechazada y expirada avisan al solicitante', async () => {
    const accepted: JoinRequestAccepted = {
      type: 'join-requests.accepted',
      ...base(),
      chargeId: randomUUID(),
      method: 'comprobante',
      listingId: null,
    };
    const rejected: JoinRequestRejected = {
      type: 'join-requests.rejected',
      ...base(),
      reason: 'Comprobante ilegible',
      byHost: true,
      rejectedAsFalse: false,
    };
    const expired: JoinRequestExpired = {
      type: 'join-requests.expired',
      ...base(),
      reason: 'plazo_vencido',
    };
    await publish(t, accepted, rejected, expired);
    const list = await notificationsOf(t, applicant.id);
    expect(list.map((n) => n.type).sort()).toEqual([
      'solicitud_aceptada',
      'solicitud_expirada',
      'solicitud_rechazada',
    ]);
    expect(list.find((n) => n.type === 'solicitud_rechazada')!.body).toContain(
      'Comprobante ilegible',
    );
    expect(await notificationsOf(t, host.id)).toHaveLength(0);
  });

  it('RF-005-25: un reclamo avisa a la parte acusada y su resolución a ambas', async () => {
    const disputeId = randomUUID();
    const opened: DisputeOpened = {
      type: 'join-requests.dispute-opened',
      ...base(),
      disputeId,
      kind: 'pago_sin_ingreso',
      openedBy: applicant.id,
      accusedId: host.id,
    };
    const resolved: DisputeResolved = {
      type: 'join-requests.dispute-resolved',
      ...base(),
      disputeId,
      kind: 'pago_sin_ingreso',
      result: 'sin_falta',
    };
    await publish(t, opened);
    expect((await notificationsOf(t, host.id)).map((n) => n.type)).toEqual(['reclamo_abierto']);
    expect(await notificationsOf(t, applicant.id)).toHaveLength(0);
    await publish(t, resolved);
    expect((await notificationsOf(t, host.id)).map((n) => n.type)).toEqual([
      'reclamo_abierto',
      'reclamo_resuelto',
    ]);
    expect((await notificationsOf(t, applicant.id)).map((n) => n.type)).toEqual([
      'reclamo_resuelto',
    ]);
  });
});
