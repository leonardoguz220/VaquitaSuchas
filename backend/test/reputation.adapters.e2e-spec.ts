import request from 'supertest';
import { AdaptersModule } from '../src/app-adapters/adapters.module.js';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';

// Adaptadores reales de la calificación (spec 007 T014): HostEligibilityPort y el puerto de
// solicitudes de ingreso, sobre cobros reales.
describe('Reputación: adaptadores de otras specs', () => {
  const harness = new BillingHarness({ imports: [AdaptersModule] });
  const fixtures = new ReputationFixtures(harness);
  const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

  const as = (userId: string) => ({
    get: (url: string): request.Test =>
      request(harness.app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${harness.token(userId)}`),
    createGroup: (): request.Test =>
      request(harness.app.getHttpServer())
        .post('/groups')
        .set('Authorization', `Bearer ${harness.token(userId)}`)
        .send({
          customServiceName: 'Mi servicio',
          name: 'Grupo de prueba',
          priceCents: 10001,
          currency: 'BS',
          billingDay: 15,
          totalSlots: 3,
        }),
  });

  async function memberWith(count: number, late: number): Promise<string> {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    for (const [i, period] of periods.slice(0, count).entries()) {
      await fixtures.fact(group, user, {
        period,
        ...(i < late ? { submittedAt: 'late' as const } : {}),
      });
    }
    return user;
  }

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-007-20: con 6 cobros puntuales queda habilitado por calificación y crea un grupo', async () => {
    const user = await memberWith(6, 0);

    const eligibility = await as(user).get('/users/me/host-eligibility').expect(200);
    expect(eligibility.body).toMatchObject({ eligible: true, source: 'calificacion' });
    expect(eligibility.body.current).toMatchObject({
      stars: 5,
      consideredCharges: 6,
      level: 'Excelente',
    });
    await as(user).createGroup().expect(201);
  });

  it('CA-007-21: si baja del umbral ya no crea grupos, pero los que tiene siguen', async () => {
    const user = await memberWith(6, 0);
    const created = await as(user).createGroup().expect(201);
    // Una racha de atrasos baja la calificación (se actualiza al vencer, sin esperar).
    const owner = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    for (const period of ['2026-09', '2026-10']) {
      await fixtures.fact(group, user, { period, status: 'atrasado', submittedAt: null });
    }

    const blocked = await as(user).createGroup().expect(422);
    expect(JSON.stringify(blocked.body)).toContain('NOT_HOST_ELIGIBLE');
    const mine = await as(user)
      .get(`/groups/${created.body.id as string}`)
      .expect(200);
    expect(mine.body.id).toBe(created.body.id);
  });

  it('RF-007-17: la habilitación manual sigue valiendo con calificación baja', async () => {
    const user = await memberWith(6, 4);
    const admin = await harness.insertUser();
    await harness.pool.query(
      `INSERT INTO host_enablements (user_id, reason, enabled_by) VALUES ($1, 'Habilitación manual de prueba', $2)`,
      [user, admin],
    );

    const eligibility = await as(user).get('/users/me/host-eligibility').expect(200);

    expect(eligibility.body).toMatchObject({ eligible: true, source: 'manual' });
  });
});
