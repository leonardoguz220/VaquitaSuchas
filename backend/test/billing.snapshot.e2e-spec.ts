import request from 'supertest';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness } from './support/billing-harness.js';

// Copia de precio y tipo de cambio en cada cobro (spec 002 T015, CA-002-16, RN-002-02) contra
// PostgreSQL real. El cambio se hace por PATCH /groups/:id (spec 001 T033).
describe('Los cobros guardan su copia del precio y del tipo de cambio', () => {
  const harness = new BillingHarness({
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({ check: () => Promise.resolve({ eligible: true, source: 'manual' }) }),
  });

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  interface Stored {
    cycle: Record<string, unknown>;
    charges: Record<string, unknown>[];
  }

  const stored = async (groupId: string, period: string): Promise<Stored> => ({
    cycle: (
      await harness.pool.query(
        `SELECT price_cents::text, currency, exchange_rate::text, total_bs_cents::text,
                base_share_cents::text, owner_share_cents::text, member_count
           FROM billing_cycles WHERE group_id = $1 AND period = $2`,
        [groupId, period],
      )
    ).rows[0],
    charges: (
      await harness.pool.query(
        `SELECT user_id, amount_cents::text, price_cents::text, currency, exchange_rate::text,
                total_bs_cents::text, member_count
           FROM charges WHERE group_id = $1 AND period = $2 ORDER BY user_id`,
        [groupId, period],
      )
    ).rows,
  });

  async function generateAt(groupId: string, iso: string): Promise<void> {
    const cycles = harness.app.get(BillingCyclesService, { strict: false });
    const db = harness.app.get(DbService, { strict: false });
    await db.withTransaction((tx) => cycles.ensureCurrentCycle(tx, groupId, new Date(iso)));
  }

  it('CA-002-16 y RN-002-02: cambiar el tipo de cambio después del corte no altera los cobros ya generados', async () => {
    const group = await harness.createGroup({ members: 2 });
    // Grupo en USD con el ciclo de septiembre ya existente, como un grupo real.
    await harness.insertCharge(group, group.memberIds[0] as string, { period: '2026-09' });
    await harness.pool.query(
      `UPDATE groups SET currency = 'USD', price_cents = 1437, exchange_rate = 6.96 WHERE id = $1`,
      [group.id],
    );
    await generateAt(group.id, '2026-11-16T15:00:00.000Z');
    const before = await stored(group.id, '2026-11');
    expect(before.charges).toHaveLength(2);
    expect(before.cycle).toMatchObject({ currency: 'USD', exchange_rate: '6.9600' });
    expect(before.charges[0]).toMatchObject({ currency: 'USD', exchange_rate: '6.9600' });

    await request(harness.app.getHttpServer())
      .patch(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .send({ exchangeRate: '7.2000' })
      .expect(200);

    expect(await stored(group.id, '2026-11')).toEqual(before);
    await generateAt(group.id, '2026-12-16T15:00:00.000Z');
    const next = await stored(group.id, '2026-12');
    expect(next.cycle).toMatchObject({ exchange_rate: '7.2000' });
    expect(next.cycle['total_bs_cents']).not.toBe(before.cycle['total_bs_cents']);
    expect(next.charges[0]).toMatchObject({ exchange_rate: '7.2000' });
    expect(await stored(group.id, '2026-11')).toEqual(before);
  });

  it('RN-002-02: cambiar el precio y la moneda tampoco reescribe el cobro del período anterior', async () => {
    const group = await harness.createGroup({ members: 2 });
    await harness.insertCharge(group, group.memberIds[0] as string, { period: '2026-09' });
    await generateAt(group.id, '2026-11-16T15:00:00.000Z');
    const before = await stored(group.id, '2026-11');

    await request(harness.app.getHttpServer())
      .patch(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .send({ priceCents: 20000 })
      .expect(200);

    expect(await stored(group.id, '2026-11')).toEqual(before);
    expect(before.cycle).toMatchObject({ price_cents: '10001', currency: 'BS' });
  });
});
