import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { inviteCodeOf, seedRequest, setClock } from './support/join-requests-fixtures.js';

// Línea de tiempo de solo anexado (spec 010 US1, T015/T016) contra PostgreSQL real.
describe('Línea de tiempo de la solicitud', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });

  const api = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', userId: string, url: string) =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => setClock(harness, NOW));

  it('CA-010-35 y RF-010-27: cada evento muestra tipo, autor y fecha, en orden', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser('Persona Solicitante');
    const opened = await api('post', person, '/join-requests')
      .send({ code: await inviteCodeOf(harness, group.id) })
      .expect(201);

    const detail = await api(
      'get',
      group.ownerId,
      `/join-requests/${opened.body.id as string}`,
    ).expect(200);

    expect(detail.body.timeline).toEqual([
      {
        type: 'abierta',
        actor: { userId: person, fullName: 'Persona Solicitante' },
        fromStatus: null,
        toStatus: 'abierta',
        reason: null,
        occurredAt: NOW,
      },
    ]);
  });

  it('CA-010-35 y RNF-010-08: el vencimiento persistido queda como evento del sistema con su motivo', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    const old = await seedRequest(harness, group, person, 'abierta', {
      openedAt: new Date(Date.parse(NOW) - 25 * 3600_000).toISOString(),
    });
    // Abrir otra solicitud persiste el vencimiento de la anterior en la misma transacción.
    await api('post', person, '/join-requests')
      .send({ code: await inviteCodeOf(harness, group.id) })
      .expect(201);

    const detail = await api('get', person, `/join-requests/${old}`).expect(200);

    expect(detail.body.phase.status).toBe('expirada');
    expect(detail.body.timeline.map((e: { type: string }) => e.type)).toEqual([
      'abierta',
      'expirada',
    ]);
    expect(detail.body.timeline[1]).toMatchObject({
      actor: null,
      fromStatus: 'abierta',
      toStatus: 'expirada',
      reason: 'plazo_solicitud',
    });
  });

  it('CA-010-35: no hay operaciones para editar o borrar la línea de tiempo (404)', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    const id = await seedRequest(harness, group, person, 'abierta');

    for (const method of ['put', 'patch', 'delete'] as const) {
      await api(method, person, `/join-requests/${id}`).expect(404);
      await api(method, person, `/join-requests/${id}/timeline`).expect(404);
      await api(method, group.ownerId, `/join-requests/${id}/events`).expect(404);
    }
  });

  it('CA-010-35: la base rechaza modificar o borrar un evento de la línea de tiempo', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    const id = await seedRequest(harness, group, person, 'abierta');

    await expect(
      harness.pool.query(`UPDATE join_request_events SET reason = 'x' WHERE request_id = $1`, [id]),
    ).rejects.toThrow();
    await expect(
      harness.pool.query('DELETE FROM join_request_events WHERE request_id = $1', [id]),
    ).rejects.toThrow();
  });

  it('CA-010-35: la lista no incluye la línea de tiempo; solo el detalle', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    await seedRequest(harness, group, person, 'abierta');

    const list = await api('get', person, '/join-requests').expect(200);

    expect(list.body.items[0].timeline).toEqual([]);
  });
});
