import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Acciones simultáneas sobre un mismo cobro (spec 002, T024, RNF-002-03): el bloqueo FOR UPDATE
// las serializa, así que una gana y la otra ve el estado ya cambiado.
describe('Concurrencia en la revisión de cobros', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let memberA: string;

  const post = (chargeId: string, action: string, body: object = {}): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/${action}`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .send(body);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    memberA = group.memberIds[0] as string;
  });

  it('CA-002-19: confirmar y cancelar a la vez: una gana y la otra recibe 409', async () => {
    for (let i = 0; i < 5; i++) {
      const chargeId = await harness.insertCharge(group, memberA, {
        status: 'en_revision',
        period: `2028-0${i + 1}`,
      });
      const [confirm, cancel] = await Promise.all([
        post(chargeId, 'confirm'),
        post(chargeId, 'cancel', { reason: 'Motivo válido' }),
      ]);
      const statuses = [confirm.status, cancel.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = confirm.status === 409 ? confirm : cancel;
      expect(['INVALID_TRANSITION', 'STALE_STATE']).toContain(loser.body.code);
      const final = await harness.pool.query<{ status: string }>(
        'SELECT status FROM charges WHERE id = $1',
        [chargeId],
      );
      expect(final.rows[0]?.status).toBe('pagado');
    }
  });

  it('CA-002-19: dos confirmaciones a la vez con la misma versión: una gana y la otra STALE_STATE o INVALID_TRANSITION', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { status: 'en_revision' });
    const current = await harness.pool.query<{ version: number }>(
      'SELECT version FROM charges WHERE id = $1',
      [chargeId],
    );
    const version = current.rows[0]?.version as number;
    const results = await Promise.all([
      post(chargeId, 'confirm', { version }),
      post(chargeId, 'confirm', { version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(['INVALID_TRANSITION', 'STALE_STATE']).toContain(loser?.body.code);
    const events = await harness.pool.query(
      "SELECT 1 FROM charge_events WHERE charge_id = $1 AND type = 'confirmado'",
      [chargeId],
    );
    expect(events.rowCount).toBe(1);
  });
});
