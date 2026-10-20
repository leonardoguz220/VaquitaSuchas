import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Series de los gráficos (spec 006, US3, T016).
describe('Panel: gráficos', () => {
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

  it('CA-006-11: con 14 meses de datos devuelve los últimos 12, sin huecos', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      individual: { cents: 3000, currency: 'BS' },
    });
    const periods = [
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ];
    for (const period of periods)
      await fixtures.charge(group, member, { period, amountCents: 1000 });
    // Septiembre de 2025 queda fuera de la ventana de 12 meses; marzo de 2026 no tiene cobro.

    const response = await get(member, '/me/dashboard/charts?month=2026-10').expect(200);

    const monthly = response.body.monthly as { period: string; totalCents: number }[];
    expect(monthly).toHaveLength(12);
    expect(monthly[0]?.period).toBe('2025-11');
    expect(monthly[11]?.period).toBe('2026-10');
    expect(monthly.find((m) => m.period === '2026-03')?.totalCents).toBe(0);
    expect(monthly.find((m) => m.period === '2026-04')?.totalCents).toBe(1000);
    expect(response.body.byService).toEqual([
      expect.objectContaining({ groupId: group.id, costCents: 1000 }),
    ]);
    const savings = response.body.savings as {
      period: string;
      savingsCents: number | null;
      cumulativeCents: number;
    }[];
    expect(savings).toHaveLength(12);
    expect(savings.find((s) => s.period === '2026-03')).toMatchObject({
      savingsCents: null,
      cumulativeCents: 8000,
    });
    // 11 meses con dato × Bs 20,00 de ahorro.
    expect(savings[11]?.cumulativeCents).toBe(22000);
  });

  it('con menos de 12 meses la serie empieza en el primer mes con datos', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, { period: '2026-08', amountCents: 1000 });

    const response = await get(member, '/me/dashboard/charts?month=2026-10').expect(200);

    expect(response.body.monthly.map((m: { period: string }) => m.period)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(
      response.body.savings.every((s: { savingsCents: number | null }) => s.savingsCents === null),
    ).toBe(true);
  });

  it('un groupId ajeno responde 404', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await get(stranger, `/me/dashboard/charts?groupId=${group.id}`).expect(404);
  });
});
