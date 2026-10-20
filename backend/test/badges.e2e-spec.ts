import request from 'supertest';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Insignias (spec 007, US2, T019/T020). Hoy es 2026-10-16 (La Paz).
describe('Insignias', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-007-08: al confirmar el tercer pago puntual se otorga «Racha 3»', async () => {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    await fixtures.fact(group, user, { period: '2026-06' });
    await fixtures.fact(group, user, { period: '2026-07' });
    const third = await fixtures.fact(group, user, { period: '2026-08', status: 'en_revision' });
    expect((await get(user, '/users/me/badges').expect(200)).body.earned).toEqual([]);

    await request(harness.app.getHttpServer())
      .post(`/charges/${third}/confirm`)
      .set('Authorization', `Bearer ${harness.token(owner)}`)
      .send({})
      .expect(200);

    const body = (await get(user, '/users/me/badges').expect(200)).body;
    expect(body.earned.map((b: { code: string }) => b.code).sort()).toEqual(
      ['primer_pago', 'racha_3', 'sin_atrasos_6m'].sort(),
    );
    expect(body.earned[0]).toMatchObject({
      name: expect.any(String),
      earnedAt: expect.any(String),
    });
    expect(body.pending.map((b: { code: string }) => b.code)).toEqual(['racha_6', 'racha_12']);
    expect(body.pending[0]).toMatchObject({ progress: { current: 3, target: 6 } });
  });

  it('CA-007-09: tras un pago tardío la insignia se conserva y la racha vuelve a 0', async () => {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    for (const period of ['2026-05', '2026-06', '2026-07'])
      await fixtures.fact(group, user, { period });
    const runner = harness.app.get(JobRunner, { strict: false });
    await runner.runAll('manual', { job: 'reputation.reconcile', ignoreInterval: true });
    expect(
      (await get(user, '/users/me/badges').expect(200)).body.earned.map(
        (b: { code: string }) => b.code,
      ),
    ).toContain('racha_3');

    await fixtures.fact(group, user, { period: '2026-08', status: 'atrasado', submittedAt: null });
    harness.clock.advance(1000);
    await runner.runAll('manual', { job: 'reputation.reconcile', ignoreInterval: true });

    const badges = (await get(user, '/users/me/badges').expect(200)).body;
    expect(badges.earned.map((b: { code: string }) => b.code)).toContain('racha_3');
    expect((await get(user, '/users/me/reputation').expect(200)).body.currentStreak).toBe(0);
  });

  it('exige sesión y solo muestra las propias', async () => {
    await request(harness.app.getHttpServer()).get('/users/me/badges').expect(401);
    const user = await harness.insertUser();
    expect((await get(user, '/users/me/badges').expect(200)).body.earned).toEqual([]);
  });
});
