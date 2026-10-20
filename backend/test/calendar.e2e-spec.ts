import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Calendario de cortes y vencimientos (spec 006, US4, T020). Hoy es 2026-10-16 (La Paz).
describe('Calendario', () => {
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

  it('CA-006-13: día de cobro 31 en febrero cae el 28 y marzo el 31, como estimado', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      billingDay: 31,
      totalBsCents: 9000,
    });

    const february = await get(member, '/me/calendar?month=2027-02').expect(200);
    expect(february.body.events).toEqual([
      expect.objectContaining({
        kind: 'corte',
        date: '2027-02-28',
        groupId: group.id,
        role: 'miembro',
        amountCents: 4500,
        estimated: true,
      }),
    ]);
    const leap = await get(member, '/me/calendar?month=2028-02').expect(200);
    expect(leap.body.events[0].date).toBe('2028-02-29');
  });

  it('muestra el vencimiento de un cobro abierto con su monto real y el rol del titular', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      totalBsCents: 9000,
    });
    await fixtures.charge(group, member, { amountCents: 3000, dueAt: '2026-10-19T04:00:00Z' });

    const mine = await get(member, '/me/calendar?month=2026-10').expect(200);
    expect(mine.body.events).toEqual([
      expect.objectContaining({
        kind: 'corte',
        date: '2026-10-15',
        amountCents: 3000,
        estimated: false,
      }),
      expect.objectContaining({
        kind: 'vencimiento',
        date: '2026-10-18',
        amountCents: 3000,
        status: 'pendiente',
      }),
    ]);
    const theirs = await get(owner, '/me/calendar?month=2026-10').expect(200);
    expect(theirs.body.events).toEqual([
      expect.objectContaining({
        kind: 'corte',
        role: 'titular',
        amountCents: 3000,
        estimated: false,
        chargeId: null,
      }),
    ]);
  });

  it('un grupo cerrado aparece solo en meses pasados', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [group.id],
    );

    const past = await get(owner, '/me/calendar?month=2026-08').expect(200);
    const future = await get(owner, '/me/calendar?month=2026-12').expect(200);
    expect(past.body.events).toHaveLength(1);
    expect(future.body.events).toHaveLength(0);
  });

  it('próximos 30 días: de hoy a hoy + 30, ordenados', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      totalBsCents: 9000,
    });
    await fixtures.charge(group, member, { amountCents: 3000, dueAt: '2026-10-19T04:00:00Z' });

    const response = await get(member, '/me/calendar/upcoming?days=30').expect(200);

    expect(
      response.body.events.map((e: { kind: string; date: string }) => [e.kind, e.date]),
    ).toEqual([
      ['vencimiento', '2026-10-18'],
      ['corte', '2026-11-15'],
    ]);
    await get(member, '/me/calendar/upcoming?days=91').expect(400);
  });
});
