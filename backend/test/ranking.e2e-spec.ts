import request from 'supertest';
import { levelFor } from '../src/modules/reputation/domain/level.js';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures, type ReportsGroup } from './support/reports-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Ranking de puntualidad del grupo (spec 007, US3, T024/T025). Lee las calificaciones guardadas.
describe('Ranking del grupo', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReportsFixtures(harness);

  const get = (userId: string, groupId: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(`/groups/${groupId}/ranking`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  /** Guarda la calificación de la persona (lo que dejaría el recálculo). */
  async function rate(
    userId: string,
    punctual: number,
    considered: number,
    streak: number,
  ): Promise<void> {
    const half =
      considered < 3 ? null : Math.floor((20 * punctual + considered) / (2 * considered));
    await harness.pool.query(
      `INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                                    displayed_half_stars, level, current_streak, rules_version, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now())`,
      [
        userId,
        considered,
        punctual,
        considered - punctual,
        half,
        half === null ? 'Nuevo' : levelFor(half),
        streak,
      ],
    );
  }

  async function setup(
    members: number,
    totalSlots?: number,
  ): Promise<{ owner: string; ids: string[]; group: ReportsGroup }> {
    const owner = await harness.insertUser('Titular');
    const ids: string[] = [];
    for (let i = 0; i < members; i++) ids.push(await harness.insertUser(`Miembro ${i}`));
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: ids, totalSlots });
    return { owner, ids, group };
  }

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-007-10: ordena por calificación exacta, racha y antigüedad; los «Nuevo» van aparte', async () => {
    const { ids, group } = await setup(4);
    await rate(ids[0] as string, 7, 8, 7); // 4,375
    await rate(ids[1] as string, 8, 8, 6); // 5,0 con racha 6
    await rate(ids[2] as string, 8, 8, 2); // 5,0 con racha 2
    await rate(ids[3] as string, 2, 2, 2); // Nuevo

    const response = await get(ids[0] as string, group.id).expect(200);

    expect(
      response.body.items.map((i: { user: { userId: string }; position: number }) => [
        i.position,
        i.user.userId,
      ]),
    ).toEqual([
      [1, ids[1]],
      [2, ids[2]],
      [3, ids[0]],
    ]);
    expect(response.body.items[0]).toMatchObject({
      rating: { level: 'Excelente', stars: 5, starsLabel: '5 de 5' },
      streak: 6,
    });
    expect(response.body.unranked).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ userId: ids[3] }),
        rating: expect.objectContaining({ level: 'Nuevo', stars: null }),
      }),
    ]);
  });

  it('CA-007-11: no devuelve montos, comprobantes ni referencias', async () => {
    const { ids, group } = await setup(2);
    await rate(ids[0] as string, 5, 5, 5);
    await fixtures.charge(group, ids[0] as string, { amountCents: 4321, status: 'pagado' });

    const response = await get(ids[1] as string, group.id).expect(200);

    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(/amount|cents|receipt|reference|4321|phone|email/i);
  });

  it('CA-007-12: quien no es del grupo recibe 404', async () => {
    const { group } = await setup(1);
    const stranger = await harness.insertUser();

    await get(stranger, group.id).expect(404);
    await request(harness.app.getHttpServer()).get(`/groups/${group.id}/ranking`).expect(401);
  });

  it('RF-007-11: el titular aparece solo si tiene cobros como miembro en otros grupos', async () => {
    const { owner, ids, group } = await setup(1);

    const without = await get(ids[0] as string, group.id).expect(200);
    expect(JSON.stringify(without.body)).not.toContain(owner);

    await rate(owner, 6, 6, 6);
    const withHistory = await get(ids[0] as string, group.id).expect(200);
    expect(
      withHistory.body.items.map((i: { user: { userId: string } }) => i.user.userId),
    ).toContain(owner);
  });

  it('RNF-007-03: con 20 integrantes responde en menos de 300 ms', async () => {
    const { owner, ids, group } = await setup(19, 20);
    await rate(owner, 20, 20, 9);
    for (const [i, id] of ids.entries()) await rate(id, 20 - (i % 5), 20, i % 7);

    const timings: number[] = [];
    for (let i = 0; i < 10; i++) {
      const started = performance.now();
      const response = await get(ids[0] as string, group.id).expect(200);
      timings.push(performance.now() - started);
      expect(response.body.items).toHaveLength(20);
    }

    timings.sort((a, b) => a - b);
    expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(300);
  });
});
