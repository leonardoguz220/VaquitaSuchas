import { DbService } from '../src/shared/db/db.service.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { DisputesRepository } from '../src/modules/join-requests/repositories/disputes.repository.js';
import { RequestEventsRepository } from '../src/modules/join-requests/repositories/events.repository.js';
import { MessagesRepository } from '../src/modules/join-requests/repositories/messages.repository.js';
import { RequestsRepository } from '../src/modules/join-requests/repositories/requests.repository.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest } from './support/join-requests-fixtures.js';

// Repositorios de la spec 010 (T012) contra PostgreSQL real: bloqueo, solo anexado y reclamos.
describe('Repositorios de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let db: DbService;
  let requests: RequestsRepository;
  let events: RequestEventsRepository;
  let messages: MessagesRepository;
  let disputes: DisputesRepository;
  let group: TestGroup;
  let applicant: string;
  let requestId: string;

  beforeAll(async () => {
    await harness.start();
    db = harness.app.get(DbService, { strict: false });
    requests = harness.app.get(RequestsRepository, { strict: false });
    events = harness.app.get(RequestEventsRepository, { strict: false });
    messages = harness.app.get(MessagesRepository, { strict: false });
    disputes = harness.app.get(DisputesRepository, { strict: false });
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    requestId = await seedRequest(harness, group, applicant, 'pago_informado');
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('RNF-010-04: findByIdForUpdate bloquea la solicitud hasta el fin de la transacción', async () => {
    let secondWaited = false;
    await db.withTransaction(async (tx) => {
      await requests.findByIdForUpdate(tx, requestId);
      const other = harness.pool
        .query('SELECT id FROM join_requests WHERE id = $1 FOR UPDATE NOWAIT', [requestId])
        .catch(() => {
          secondWaited = true;
        });
      await other;
    });
    expect(secondWaited).toBe(true);
  });

  it('RNF-010-04: los bigint y numeric llegan como número o texto exacto', async () => {
    const record = await requests.findById(db, requestId);
    expect(record?.quoteAmountCents).toBe(3333);
    expect(record?.status).toBe('pago_informado');
    expect(record?.version).toBe(3);
  });

  it('RNF-010-08: los eventos se anexan en orden y no se pueden modificar', async () => {
    await events.insert(db, {
      requestId,
      type: 'comprobante_subido',
      actorId: applicant,
      fromStatus: 'esperando_pago',
      toStatus: 'pago_informado',
      occurredAt: new Date(NOW),
    });
    await events.insert(db, {
      requestId,
      type: 'recordatorio_enviado',
      actorId: null,
      fromStatus: null,
      toStatus: null,
      metadata: { minutes: 30 },
      occurredAt: new Date(Date.parse(NOW) + 1000),
    });

    const timeline = await events.listByRequest(db, requestId);

    expect(timeline.map((e) => e.type)).toEqual([
      'abierta',
      'comprobante_subido',
      'recordatorio_enviado',
    ]);
    expect(timeline[2]?.actorId).toBeNull();
    await expect(
      harness.pool.query(
        `UPDATE join_request_events SET type = 'confirmada' WHERE request_id = $1`,
        [requestId],
      ),
    ).rejects.toThrow();
  });

  it('RF-010-06 y RF-010-09: mensajes ordenados por seq, sondeo con afterSeq y conteo de no leídos', async () => {
    const first = await messages.insert(db, { requestId, senderId: group.ownerId, body: 'Hola' });
    const second = await messages.insert(db, { requestId, senderId: applicant, body: 'Ya pagué' });
    const third = await messages.insert(db, { requestId, senderId: group.ownerId, body: 'Reviso' });

    const all = await messages.listAfter(db, requestId, 0, 100);
    const newer = await messages.listAfter(db, requestId, first.seq, 100);

    expect(all.map((m) => m.id)).toEqual([first.id, second.id, third.id]);
    expect(newer.map((m) => m.id)).toEqual([second.id, third.id]);
    expect(await messages.unreadCount(db, requestId, applicant)).toBe(2);
    expect(await messages.unreadCount(db, requestId, group.ownerId)).toBe(1);

    await messages.markRead(db, requestId, applicant, third.seq);
    await messages.markRead(db, requestId, applicant, first.seq); // nunca retrocede

    expect(await messages.unreadCount(db, requestId, applicant)).toBe(0);
    expect(await messages.lastSeq(db, requestId)).toBe(third.seq);
    expect(await messages.unreadTotal(db, group.ownerId)).toBe(1);
  });

  it('CA-010-23: la base no permite editar mensajes', async () => {
    await expect(
      harness.pool.query(`UPDATE join_messages SET body = 'x' WHERE request_id = $1`, [requestId]),
    ).rejects.toThrow();
  });

  it('RF-010-22: un reclamo admite una sola respuesta y una resolución definitiva', async () => {
    const closed = await seedRequest(harness, group, await harness.insertUser(), 'rechazada');
    const dispute = await disputes.insert(db, {
      requestId: closed,
      kind: 'comprobante_falso',
      openedBy: group.ownerId,
      accusedId: (await requests.findById(db, closed))?.applicantId as string,
      description: 'El comprobante no corresponde a mi cuenta',
      openedAt: new Date(NOW),
    });

    const responded = await disputes.saveResponse(db, dispute.id, {
      text: 'Pagué desde otra cuenta mía',
      respondedAt: new Date(NOW),
    });
    await expect(
      disputes.saveResponse(db, dispute.id, {
        text: 'Otra respuesta distinta',
        respondedAt: new Date(NOW),
      }),
    ).rejects.toThrow();
    const resolved = await disputes.resolve(db, dispute.id, {
      resolution: 'sin_falta',
      reason: 'Se verificó el pago en el banco',
      resolvedBy: group.ownerId,
      resolvedAt: new Date(NOW),
    });

    expect(responded.responseText).toBe('Pagué desde otra cuenta mía');
    expect(resolved.status).toBe('resuelto');
    expect(await disputes.listByRequest(db, closed)).toHaveLength(1);
    await expect(
      disputes.resolve(db, dispute.id, {
        resolution: 'estafa_confirmada',
        reason: 'Cambio de decisión posterior',
        resolvedBy: group.ownerId,
        resolvedAt: new Date(NOW),
      }),
    ).rejects.toThrow();
  });
});
