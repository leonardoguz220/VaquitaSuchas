import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Habilitación como titular por calificación (spec 007, RF-007-15 a 17, T012).
describe('Reputación: habilitación como titular', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);

  const get = (userId: string, url = '/users/me/reputation'): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

  async function member(count: number, late = 0) {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    for (const [i, period] of periods.slice(0, count).entries()) {
      await fixtures.fact(group, user, {
        period,
        ...(i < late ? { submittedAt: 'late' as const } : {}),
      });
    }
    return { owner, user };
  }

  it('CA-007-20: con 6 cobros considerados y 5 estrellas queda habilitado; con 5, no', async () => {
    const six = await member(6);
    const five = await member(5);

    expect((await get(six.user).expect(200)).body.host).toMatchObject({
      eligible: true,
      source: 'calificacion',
    });
    const short = (await get(five.user).expect(200)).body.host;
    expect(short.eligible).toBe(false);
    expect(short.missing).toHaveLength(1);
  });

  it('CA-007-21: si baja del umbral deja de estar habilitado por calificación', async () => {
    const low = await member(6, 2); // 4 de 6 puntuales: 3,5 estrellas

    const body = (await get(low.user).expect(200)).body;

    expect(body.stars).toBe(3.5);
    expect(body.host).toMatchObject({ eligible: false, source: null });
    expect(body.host.missing).toHaveLength(1);
  });

  it('CA-007-23: la habilitación manual es independiente de la calificación baja', async () => {
    const low = await member(6, 3);
    await harness.pool.query(
      `INSERT INTO host_enablements (user_id, reason, enabled_by) VALUES ($1, 'Habilitación del administrador', $2)`,
      [low.user, low.owner],
    );

    const body = (await get(low.user).expect(200)).body;

    expect(body.stars).toBeLessThan(4.5);
    expect(body.host).toMatchObject({ eligible: true, source: 'manual', missing: [] });
  });
});
