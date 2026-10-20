import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness } from './support/billing-harness.js';
import { seedRequest } from './support/join-requests-fixtures.js';

// Último cupo con dos solicitudes simultáneas (spec 010, T019) contra PostgreSQL real.
describe('Concurrencia de cupos en solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });

  const sendPaymentData = (ownerId: string, requestId: string): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/join-requests/${requestId}/payment-data`)
      .set('Authorization', `Bearer ${harness.token(ownerId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-010-06 y RN-010-02: con un único cupo y dos solicitudes simultáneas, solo una pasa a esperando_pago', async () => {
    const group = await harness.createGroup({ members: 3 }); // 4 de 5 cupos
    const ids = [
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
    ];

    const results = await Promise.all(ids.map((id) => sendPaymentData(group.ownerId, id)));

    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    const loser = results.find((r) => r.status === 422);
    expect(loser?.body.code).toBe('NO_SLOTS_AVAILABLE');
    const states = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_requests WHERE id = ANY($1::uuid[]) ORDER BY status',
      [ids],
    );
    expect(states.rows.map((r) => r.status)).toEqual(['abierta', 'esperando_pago']);
  });

  it('CA-010-06: con dos cupos y tres solicitudes simultáneas, pasan dos', async () => {
    const group = await harness.createGroup({ members: 2 }); // 3 de 5 cupos
    const ids = [
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
    ];

    const results = await Promise.all(ids.map((id) => sendPaymentData(group.ownerId, id)));

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 422]);
  });
});
