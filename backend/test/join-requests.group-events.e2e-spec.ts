import request from 'supertest';
import { DbService } from '../src/shared/db/db.service.js';
import type { DomainEvent } from '../src/shared/events/domain-event.js';
import type {
  JoinRequestCancelled,
  JoinRequestRejected,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { inviteCodeOf, seedRequest, setClock } from './support/join-requests-fixtures.js';

// Cierre del grupo, baneo y suspensión frente a las solicitudes activas (spec 010 US7, T041/T043).
describe('Solicitudes ante eventos de grupo y de cuenta', () => {
  const harness = new BillingHarness({
    imports: [JoinRequestsModule],
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({ check: () => Promise.resolve({ eligible: true, source: 'manual' }) }),
  });
  const rejected: JoinRequestRejected[] = [];
  const cancelled: JoinRequestCancelled[] = [];

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const publish = (event: DomainEvent): Promise<void> =>
    harness.app
      .get(DbService, { strict: false })
      .withTransaction((tx) => harness.app.get(TxEventBus, { strict: false }).publish(tx, event));
  const row = async (id: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM join_requests WHERE id = $1', [id])).rows[0];
  const newGroup = (): Promise<TestGroup> => harness.createGroup({ members: 1 });

  beforeAll(async () => {
    await harness.start();
    const bus = harness.app.get(TxEventBus, { strict: false });
    bus.register<JoinRequestRejected>('join-requests.rejected', (_tx, e) => {
      rejected.push(e);
    });
    bus.register<JoinRequestCancelled>('join-requests.cancelled', (_tx, e) => {
      cancelled.push(e);
    });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => {
    rejected.length = 0;
    cancelled.length = 0;
  });
  afterEach(() => setClock(harness, NOW));

  it('CA-010-32: al cerrar el grupo sus solicitudes activas pasan a rechazada por el sistema', async () => {
    const group = await newGroup();
    const a = await harness.insertUser();
    const b = await harness.insertUser();
    const open = await seedRequest(harness, group, a, 'abierta');
    const paying = await seedRequest(harness, group, b, 'esperando_pago');
    const other = await newGroup();
    const untouched = await seedRequest(harness, other, a, 'abierta');

    await publish({ type: 'groups.closed', groupId: group.id } as DomainEvent);

    for (const id of [open, paying]) {
      expect(await row(id)).toMatchObject({ status: 'rechazada', final_reason: 'grupo_cerrado' });
    }
    expect((await row(untouched))['status']).toBe('abierta');
    expect(rejected.map((e) => e.reason)).toEqual(['grupo_cerrado', 'grupo_cerrado']);
    expect(rejected.every((e) => !e.byHost)).toBe(true);
    const events = await harness.pool.query(
      `SELECT actor_kind, reason FROM join_request_events WHERE request_id = $1 AND type = 'rechazada'`,
      [open],
    );
    expect(events.rows).toEqual([{ actor_kind: 'sistema', reason: 'grupo_cerrado' }]);
  });

  it('CA-010-32: si banean al titular, las solicitudes de su grupo pasan a rechazada', async () => {
    const group = await newGroup();
    const a = await harness.insertUser();
    const id = await seedRequest(harness, group, a, 'pago_informado');

    await publish({ type: 'users.banned', userId: group.ownerId } as DomainEvent);

    expect(await row(id)).toMatchObject({ status: 'rechazada', final_reason: 'titular_baneado' });
  });

  it('CA-010-33 y RN-010-09: el titular con una solicitud en pago no puede transferir ni cerrar', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;
    await seedRequest(harness, group, await harness.insertUser(), 'pago_informado');

    const transfer = await auth(
      http().post(`/groups/${group.id}/transfer-ownership`),
      group.ownerId,
    ).send({ toUserId: target });
    const close = await auth(http().post(`/groups/${group.id}/close`), group.ownerId);

    expect(transfer.status).toBe(422);
    expect(transfer.body.details?.rule ?? transfer.body.rule).toBe('RN-010-09');
    expect(close.status).toBe(422);
  });

  it('CA-010-33: una solicitud abierta (sin pago) no bloquea la transferencia', async () => {
    const group = await newGroup();
    await seedRequest(harness, group, await harness.insertUser(), 'abierta');

    const response = await auth(
      http().post(`/groups/${group.id}/transfer-ownership`),
      group.ownerId,
    ).send({ toUserId: group.memberIds[0] });

    expect(response.status).toBe(200);
  });

  it('CA-010-34: un solicitante suspendido o baneado ve canceladas sus solicitudes activas', async () => {
    const group = await newGroup();
    const g2 = await newGroup();
    const suspended = await harness.insertUser();
    const banned = await harness.insertUser();
    const s1 = await seedRequest(harness, group, suspended, 'abierta');
    const s2 = await seedRequest(harness, g2, suspended, 'esperando_pago');
    const b1 = await seedRequest(harness, group, banned, 'pago_informado');

    await publish({ type: 'users.suspended', userId: suspended } as DomainEvent);
    await publish({ type: 'users.banned', userId: banned } as DomainEvent);

    for (const id of [s1, s2, b1]) {
      expect(await row(id)).toMatchObject({
        status: 'cancelada',
        final_reason: 'solicitante_suspendido',
      });
    }
    expect(cancelled).toHaveLength(3);
    expect(cancelled.every((e) => e.bySystem)).toBe(true);
  });

  it('CA-010-34: una cuenta suspendida no puede abrir una solicitud', async () => {
    const group = await newGroup();
    const person = await harness.insertUser();
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [person]);

    const response = await auth(http().post('/join-requests'), person).send({
      code: await inviteCodeOf(harness, group.id),
    });

    expect([401, 403]).toContain(response.status);
  });
});
