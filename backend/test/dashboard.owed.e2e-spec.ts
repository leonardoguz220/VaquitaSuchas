import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// «Me deben» y cobranza del titular (spec 006, US2, T010/T011).
describe('Panel: me deben y cobranza', () => {
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

  it('CA-006-08: Me deben suma los 5 cobros abiertos del grupo', async () => {
    const owner = await harness.insertUser();
    const members = [];
    for (let i = 0; i < 5; i++) members.push(await harness.insertUser());
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: members });
    const statuses = ['pendiente', 'atrasado', 'en_revision', 'pendiente', 'pendiente'] as const;
    for (const [i, member] of members.entries()) {
      await fixtures.charge(group, member, {
        amountCents: i === 0 ? 2000 : undefined,
        status: statuses[i],
      });
    }

    const response = await get(owner, '/me/dashboard?month=2026-10').expect(200);

    expect(response.body.owed.count).toBe(5);
    expect(response.body.owed.groups).toEqual([
      expect.objectContaining({
        groupId: group.id,
        count: 5,
        totalCents: response.body.owed.totalCents,
      }),
    ]);
    const lists = await get(owner, '/me/dashboard/lists?list=owed').expect(200);
    expect(lists.body.items).toHaveLength(5);
    expect(lists.body.items[0].memberName).toEqual(expect.any(String));
  });

  it('CA-006-09: esperado Bs 90,00 y cobrado Bs 60,00 es 67 % y Bs 30,00 pendientes', async () => {
    const owner = await harness.insertUser();
    const members = [
      await harness.insertUser(),
      await harness.insertUser(),
      await harness.insertUser(),
    ];
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: members });
    await fixtures.charge(group, members[0] as string, { amountCents: 3000, status: 'pagado' });
    await fixtures.charge(group, members[1] as string, { status: 'pagado' });
    await fixtures.charge(group, members[2] as string, {
      status: 'atrasado',
      dueAt: '2026-10-10T04:00:00Z',
    });

    const summary = await get(owner, '/me/dashboard?month=2026-10').expect(200);
    expect(summary.body.collection).toEqual([
      expect.objectContaining({
        groupId: group.id,
        expectedCents: 9000,
        collectedCents: 6000,
        pendingCents: 3000,
        percentCollected: 67,
        lateMembers: [
          expect.objectContaining({ userId: members[2], daysLate: 6, dueDate: '2026-10-09' }),
        ],
      }),
    ]);

    const detail = await get(owner, `/groups/${group.id}/collection?period=2026-10`).expect(200);
    expect(detail.body).toMatchObject({ percentCollected: 67, availablePeriods: ['2026-10'] });
    expect(detail.body.members).toHaveLength(3);
    expect(JSON.stringify(detail.body)).not.toMatch(/receipt|reference/i);
  });

  it('el miembro recibe 403 y quien no es del grupo 404 en la cobranza', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });

    await get(member, `/groups/${group.id}/collection`).expect(403);
    await get(stranger, `/groups/${group.id}/collection`).expect(404);
    await get(owner, '/groups/no-es-uuid/collection').expect(404);
    const empty = await get(owner, `/groups/${group.id}/collection?period=2026-01`).expect(200);
    expect(empty.body).toMatchObject({ expectedCents: 0, percentCollected: null });
  });
});
