import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

// Consulta de solicitudes (spec 010 US1, T014: RF-010-26, RNF-010-07) contra PostgreSQL real.
describe('Listas y resumen de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const minutesAfterNow = (m: number): string =>
    new Date(Date.parse(NOW) + m * 60_000).toISOString();

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => setClock(harness, NOW));

  it('RF-010-26: el solicitante ve las suyas, las más recientes primero, con filtro por estado', async () => {
    const person = await harness.insertUser();
    const groupA = await harness.createGroup({ members: 1 });
    const groupB = await harness.createGroup({ members: 1 });
    const first = await seedRequest(harness, groupA, person, 'cancelada', {
      openedAt: minutesAfterNow(-30),
    });
    const second = await seedRequest(harness, groupB, person, 'abierta', {
      openedAt: minutesAfterNow(-10),
    });

    const all = await get(person, '/join-requests?role=solicitante').expect(200);
    const onlyOpen = await get(person, '/join-requests?status=abierta').expect(200);
    const byGroup = await get(person, `/join-requests?groupId=${groupA.id}`).expect(200);

    expect(all.body.items.map((r: { id: string }) => r.id)).toEqual([second, first]);
    expect(onlyOpen.body.items.map((r: { id: string }) => r.id)).toEqual([second]);
    expect(byGroup.body.items.map((r: { id: string }) => r.id)).toEqual([first]);
    expect(all.body.nextCursor).toBeNull();
  });

  it('RF-010-26: el titular ve la cola de más antigua a más reciente, con calificación y cupos', async () => {
    const group = await harness.createGroup({ members: 1 });
    const [a, b] = [await harness.insertUser('Ana'), await harness.insertUser('Beto')];
    const older = await seedRequest(harness, group, a, 'abierta', {
      openedAt: minutesAfterNow(-20),
    });
    const newer = await seedRequest(harness, group, b, 'esperando_pago', {
      openedAt: minutesAfterNow(-5),
    });

    const queue = await get(group.ownerId, `/groups/${group.id}/join-requests`).expect(200);
    const asHost = await get(group.ownerId, '/join-requests?role=titular').expect(200);

    expect(queue.body.items.map((r: { id: string }) => r.id)).toEqual([older, newer]);
    expect(asHost.body.items.map((r: { id: string }) => r.id)).toEqual([older, newer]);
    expect(queue.body.items[0].applicant).toEqual({
      userId: a,
      fullName: 'Ana',
      stars: null,
      level: null,
    });
    // 5 cupos, 2 miembros y una reserva (esperando_pago vigente): quedan 2 (RN-010-02).
    expect(queue.body.slots).toEqual({ total: 5, members: 2, reserved: 1, available: 2 });
    expect(queue.body.items[0].entryWindow.isOpen).toBe(true);
  });

  it('RF-010-26: la paginación por cursor entrega todas sin repetir y rechaza un cursor inválido', async () => {
    const group = await harness.createGroup({ members: 1 });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        await seedRequest(harness, group, await harness.insertUser(), 'abierta', {
          openedAt: minutesAfterNow(-50 + i),
        }),
      );
    }
    const url = `/groups/${group.id}/join-requests`;

    const page1 = await get(group.ownerId, `${url}?limit=2`).expect(200);
    const page2 = await get(
      group.ownerId,
      `${url}?limit=2&cursor=${page1.body.nextCursor as string}`,
    ).expect(200);
    const page3 = await get(
      group.ownerId,
      `${url}?limit=2&cursor=${page2.body.nextCursor as string}`,
    ).expect(200);

    const seen = [...page1.body.items, ...page2.body.items, ...page3.body.items].map(
      (r: { id: string }) => r.id,
    );
    expect(seen).toEqual(ids);
    expect(page3.body.nextCursor).toBeNull();
    await get(group.ownerId, `${url}?cursor=basura`).expect(400);
    await get(group.ownerId, `${url}?limit=0`).expect(400);
    await get(group.ownerId, `${url}?limit=51`).expect(400);
  });

  it('RNF-010-07: 50 solicitudes se listan en menos de 500 ms', async () => {
    const person = await harness.insertUser();
    const group = await harness.createGroup({ members: 1 });
    for (let i = 0; i < 50; i++) {
      await seedRequest(harness, group, person, 'cancelada', {
        openedAt: minutesAfterNow(-1000 + i),
      });
    }

    const started = Date.now();
    const response = await get(person, '/join-requests?limit=50').expect(200);
    const elapsed = Date.now() - started;

    expect(response.body.items).toHaveLength(50);
    expect(elapsed).toBeLessThan(500);
  });

  it('RF-010-26: el resumen cuenta no leídos, acciones pendientes del titular y activas del solicitante', async () => {
    const group = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    await seedRequest(harness, group, person, 'abierta');
    const other = await harness.insertUser();
    await seedRequest(harness, group, other, 'pago_informado');
    const third = await harness.insertUser();
    await seedRequest(harness, group, third, 'esperando_pago');
    const requestId = (
      await harness.pool.query<{ id: string }>(
        'SELECT id FROM join_requests WHERE applicant_id = $1',
        [person],
      )
    ).rows[0]?.id as string;
    await harness.pool.query(
      'INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, $3), ($1, $2, $3)',
      [requestId, group.ownerId, 'Hola'],
    );

    const host = await get(group.ownerId, '/me/join-requests/summary').expect(200);
    const applicant = await get(person, '/me/join-requests/summary').expect(200);

    // Para el titular: `abierta` y `pago_informado` esperan su acción; `esperando_pago` espera al solicitante.
    expect(host.body).toEqual({ unreadMessages: 0, actionableAsHost: 2, activeAsApplicant: 0 });
    expect(applicant.body).toEqual({
      unreadMessages: 2,
      actionableAsHost: 0,
      activeAsApplicant: 1,
    });
  });
});
