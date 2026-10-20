import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Mi calificación (spec 007, US1, T011/T012).
describe('Reputación: mi calificación', () => {
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

  const periods = [
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ];

  it('CA-007-01: 9 de 10 puntuales son 4,5 estrellas, «Bueno» y habilitado como titular', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [member] });
    for (const [i, period] of periods.entries()) {
      await fixtures.fact(group, member, {
        period,
        ...(i === 0 ? { submittedAt: 'late' as const } : {}),
      });
    }

    const response = await get(member).expect(200);

    expect(response.body).toMatchObject({
      level: 'Bueno',
      stars: 4.5,
      starsLabel: '4,5 de 5',
      consideredCount: 10,
      punctualCount: 9,
      lateCount: 1,
      currentStreak: 9,
      exactStars: '4.5000',
      host: {
        eligible: true,
        source: 'calificacion',
        minStars: 4.5,
        minConsideredCharges: 6,
        missing: [],
      },
      formula: { version: 1 },
    });
    expect(response.body.recent).toHaveLength(10);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('CA-007-02: con 2 cobros es «Nuevo», sin estrellas', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.fact(group, member, { period: '2026-07' });
    await fixtures.fact(group, member, { period: '2026-08' });

    const response = await get(member).expect(200);

    expect(response.body).toMatchObject({
      level: 'Nuevo',
      stars: null,
      starsLabel: null,
      consideredCount: 2,
    });
    expect(response.body.host.eligible).toBe(false);
  });

  it('exige sesión y no hay consulta abierta de otra persona (RNF-007-04)', async () => {
    await request(harness.app.getHttpServer()).get('/users/me/reputation').expect(401);
    const user = await harness.insertUser();
    await get(user, `/users/${user}/reputation`).expect(404);
  });
});
