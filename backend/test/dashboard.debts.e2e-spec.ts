import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// «Debo» y «en revisión» del panel (spec 006, US1, T008).
describe('Panel: lo que debo', () => {
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);
  let owner: string;
  let member: string;

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

  beforeEach(async () => {
    owner = await harness.insertUser();
    member = await harness.insertUser();
  });

  it('CA-006-06: Debo suma pendiente y atrasado de todos los períodos (Bs 25,00)', async () => {
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, {
      period: '2026-08',
      amountCents: 1000,
      status: 'atrasado',
    });
    await fixtures.charge(group, member, { period: '2026-10', amountCents: 1500 });
    await fixtures.charge(group, member, {
      period: '2026-09',
      amountCents: 9999,
      status: 'pagado',
    });

    const summary = await get(member, '/me/dashboard?month=2026-10').expect(200);

    expect(summary.body.debts).toMatchObject({ totalCents: 2500, count: 2 });

    const lists = await get(member, '/me/dashboard/lists?list=debts').expect(200);
    const items = lists.body.items as { period: string; amountCents: number; link: string }[];
    // Del más vencido al más reciente.
    expect(items.map((i) => i.period)).toEqual(['2026-08', '2026-10']);
    expect(items.reduce((sum, i) => sum + i.amountCents, 0)).toBe(2500);
    expect(items[0]?.link).toMatch(/^\/cobros\/[0-9a-f-]{36}$/);
  });

  it('CA-006-07: lo que está en revisión va aparte y no se suma a la deuda', async () => {
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, { amountCents: 1500 });
    await fixtures.charge(group, member, {
      period: '2026-09',
      amountCents: 800,
      status: 'en_revision',
    });

    const summary = await get(member, '/me/dashboard?month=2026-10').expect(200);
    expect(summary.body.debts).toEqual({
      totalCents: 1500,
      count: 1,
      inReviewCents: 800,
      inReviewCount: 1,
    });

    const lists = await get(member, '/me/dashboard/lists?list=in_review').expect(200);
    expect(lists.body.items).toHaveLength(1);
    expect(lists.body.items[0]).toMatchObject({ amountCents: 800, status: 'en_revision' });
  });

  it('pagina por cursor sin repetir ni saltar cobros', async () => {
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    for (const m of ['07', '08', '09']) {
      await fixtures.charge(group, member, { period: `2026-${m}`, amountCents: 100 });
    }

    const first = await get(member, '/me/dashboard/lists?list=debts&limit=2').expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(
      member,
      `/me/dashboard/lists?list=debts&limit=2&cursor=${first.body.nextCursor as string}`,
    ).expect(200);

    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map(
      (i: { chargeId: string }) => i.chargeId,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it('un cursor inválido responde 400 y «me deben» sin ser titular 403', async () => {
    await get(member, '/me/dashboard/lists?list=debts&cursor=basura').expect(400);
    await get(member, '/me/dashboard/lists?list=owed').expect(403);
  });
});
