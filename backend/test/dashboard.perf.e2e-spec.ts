import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Rendimiento del panel (spec 006, CA-006-19, RNF-006-01): 20 suscripciones × 12 meses.
describe('Panel: rendimiento', () => {
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);

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

  it('CA-006-19: el resumen responde en menos de 1 s (p95) con 20 suscripciones y 12 meses', async () => {
    const user = await harness.insertUser();
    const periods = Array.from(
      { length: 12 },
      (_, i) => `${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`,
    );
    for (let g = 0; g < 20; g++) {
      const owner = await harness.insertUser();
      const group = await fixtures.createGroup({
        ownerId: owner,
        memberIds: [user],
        serviceName: `Servicio ${g}`,
        individual: { cents: 5000, currency: 'BS' },
      });
      for (const period of periods)
        await fixtures.charge(group, user, { period, amountCents: 1000 + g });
    }

    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      const response = await get(user, '/me/dashboard?month=2026-08').expect(200);
      timings.push(performance.now() - started);
      expect(response.body.spend.lines).toHaveLength(20);
    }
    const charts = performance.now();
    await get(user, '/me/dashboard/charts?month=2026-08').expect(200);
    const chartsMs = performance.now() - charts;

    timings.sort((a, b) => a - b);
    expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(1000);
    expect(chartsMs).toBeLessThan(1000);
  }, 120_000);
});
