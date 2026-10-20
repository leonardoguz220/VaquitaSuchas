import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Recálculo por eventos (spec 007, T008/T009): sin esperar a la conciliación.
describe('Reputación: recálculo por eventos', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  const stored = async (userId: string) =>
    (
      await harness.pool.query<{
        considered_count: number;
        punctual_count: number;
        late_count: number;
      }>(
        'SELECT considered_count, punctual_count, late_count FROM user_reputation WHERE user_id = $1',
        [userId],
      )
    ).rows[0];

  it('CA-007-15: al confirmar el pago se actualiza la calificación en la misma operación', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [member] });
    // En revisión con comprobante subido a tiempo (primera subida el 18).
    const chargeId = await fixtures.fact(group, member, { status: 'en_revision' });
    expect(await stored(member)).toBeUndefined();

    await request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/confirm`)
      .set('Authorization', `Bearer ${harness.token(owner)}`)
      .send({})
      .expect(200);

    expect(await stored(member)).toEqual({ considered_count: 1, punctual_count: 1, late_count: 0 });
  });

  it('al cancelar un cobro atrasado deja de contar', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [member] });
    const chargeId = await fixtures.fact(group, member, { status: 'atrasado', submittedAt: null });
    await request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/cancel`)
      .set('Authorization', `Bearer ${harness.token(owner)}`)
      .send({ reason: 'El miembro salió del grupo' })
      .expect(200);

    expect(await stored(member)).toEqual({ considered_count: 0, punctual_count: 0, late_count: 0 });
  });
});
