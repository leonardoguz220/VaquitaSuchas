import request from 'supertest';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Edición del grupo (spec 001 T032/T033): PATCH /groups/:id contra PostgreSQL real.
describe('Editar grupos', () => {
  const harness = new BillingHarness({
    configure: (builder) =>
      builder.overrideProvider(HOST_ELIGIBILITY_PORT).useValue({
        check: () => Promise.resolve({ eligible: true, source: 'manual' }),
      }),
  });

  const patch = (userId: string, groupId: string, body: object): request.Test =>
    request(harness.app.getHttpServer())
      .patch(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);

  /** Grupo con titular, 2 miembros activos, un ciclo 2026-10 y un cobro por miembro. */
  async function groupWithCharges(): Promise<TestGroup> {
    const group = await harness.createGroup({ members: 2 });
    for (const memberId of group.memberIds) await harness.insertCharge(group, memberId);
    return group;
  }

  const snapshotOf = async (groupId: string): Promise<unknown> => ({
    cycles: (
      await harness.pool.query(
        `SELECT period, price_cents::text, currency, exchange_rate::text, total_bs_cents::text,
                base_share_cents::text, owner_share_cents::text, member_count
           FROM billing_cycles WHERE group_id = $1 ORDER BY period`,
        [groupId],
      )
    ).rows,
    charges: (
      await harness.pool.query(
        `SELECT user_id, period, status, amount_cents::text, price_cents::text, currency,
                total_bs_cents::text
           FROM charges WHERE group_id = $1 ORDER BY user_id, period`,
        [groupId],
      )
    ).rows,
  });

  const groupRow = async (groupId: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM groups WHERE id = $1', [groupId])).rows[0];

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('RF-001-14: el titular edita nombre, precio y cupos; la versión sube y se devuelve el GroupDetail', async () => {
    const group = await groupWithCharges();
    const before = (await groupRow(group.id))['version'] as number;

    const response = await patch(group.ownerId, group.id, {
      name: 'Nombre nuevo',
      priceCents: 12000,
      totalSlots: 6,
      acceptingMembers: false,
      version: before,
    }).expect(200);

    expect(response.body).toMatchObject({
      id: group.id,
      name: 'Nombre nuevo',
      priceCents: 12000,
      totalSlots: 6,
      version: before + 1,
    });
    const stored = await groupRow(group.id);
    expect(stored).toMatchObject({
      name: 'Nombre nuevo',
      total_slots: 6,
      accepting_members: false,
    });
  });

  it('CA-001-16 y RN-001-03: cambiar precio, moneda o tipo de cambio no altera cobros ni ciclos ya generados', async () => {
    const group = await groupWithCharges();
    const before = await snapshotOf(group.id);

    await patch(group.ownerId, group.id, {
      currency: 'USD',
      priceCents: 1500,
      exchangeRate: '6.96',
    }).expect(200);
    await patch(group.ownerId, group.id, { exchangeRate: '7.10' }).expect(200);

    expect(await snapshotOf(group.id)).toEqual(before);
    expect(await groupRow(group.id)).toMatchObject({ currency: 'USD', price_cents: '1500' });
  });

  it('RF-001-03: USD exige tipo de cambio y BS lo prohíbe (400)', async () => {
    const group = await groupWithCharges();

    const missing = await patch(group.ownerId, group.id, { currency: 'USD' }).expect(400);
    expect(missing.body.details.fields.exchangeRate).toEqual(['EXCHANGE_RATE_REQUIRED']);
    const extra = await patch(group.ownerId, group.id, { exchangeRate: '6.96' }).expect(400);
    expect(extra.body.details.fields.exchangeRate).toEqual(['EXCHANGE_RATE_NOT_ALLOWED']);
  });

  it('RF-001-14: bajar los cupos por debajo de los miembros responde SLOTS_BELOW_MEMBERS con el mínimo', async () => {
    const group = await groupWithCharges();

    const response = await patch(group.ownerId, group.id, { totalSlots: 2 }).expect(422);

    expect(response.body).toMatchObject({
      code: 'SLOTS_BELOW_MEMBERS',
      details: { rule: 'RF-001-14', minSlots: 3 },
    });
    expect(await groupRow(group.id)).toMatchObject({ total_slots: 5 });
    await patch(group.ownerId, group.id, { totalSlots: 3 }).expect(200);
  });

  it('RN-001-09: un precio fuera de rango se rechaza', async () => {
    const group = await groupWithCharges();

    const response = await patch(group.ownerId, group.id, { priceCents: 50 }).expect(422);

    expect(response.body).toMatchObject({ code: 'BUSINESS_RULE', details: { rule: 'RN-001-09' } });
  });

  it('RF-001-14: el nuevo billing_day rige desde el siguiente corte, sin recortar el ciclo existente', async () => {
    const group = await groupWithCharges();
    // El ciclo de septiembre (el del mes de creación) ya existe, como en un grupo real.
    await harness.insertCharge(group, group.memberIds[0] as string, { period: '2026-09' });
    const before = await snapshotOf(group.id);
    const cycles = harness.app.get(BillingCyclesService, { strict: false });
    const db = harness.app.get(DbService, { strict: false });
    const ensureAt = (iso: string): Promise<unknown> =>
      db.withTransaction((tx) => cycles.ensureCurrentCycle(tx, group.id, new Date(iso)));

    await patch(group.ownerId, group.id, { billingDay: 20 }).expect(200);

    expect(await snapshotOf(group.id)).toEqual(before);
    expect(await ensureAt('2026-10-17T15:00:00.000Z')).toBeNull();
    expect(await ensureAt('2026-11-21T15:00:00.000Z')).toMatchObject({ period: '2026-11' });
    const cut = await harness.pool.query(
      `SELECT cut_date::text FROM billing_cycles WHERE group_id = $1 AND period = '2026-11'`,
      [group.id],
    );
    expect(cut.rows[0].cut_date).toBe('2026-11-20');
  });

  it('RF-001-14: con una versión vieja responde 409 STALE_STATE y no cambia nada', async () => {
    const group = await groupWithCharges();
    const version = (await groupRow(group.id))['version'] as number;
    await patch(group.ownerId, group.id, { name: 'Primero', version }).expect(200);

    const response = await patch(group.ownerId, group.id, { name: 'Segundo', version }).expect(409);

    expect(response.body.code).toBe('STALE_STATE');
    expect(await groupRow(group.id)).toMatchObject({ name: 'Primero' });
  });

  it('CA-001-16 y RN-001-07: un grupo cerrado rechaza la edición', async () => {
    const group = await groupWithCharges();
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [group.id],
    );

    const response = await patch(group.ownerId, group.id, { name: 'Nuevo nombre' }).expect(422);

    expect(response.body).toMatchObject({ code: 'GROUP_CLOSED', details: { rule: 'RN-001-07' } });
  });

  it('RF-009-22: un grupo congelado rechaza la edición', async () => {
    const group = await groupWithCharges();
    await harness.freezeGroup(group.id);

    const response = await patch(group.ownerId, group.id, { name: 'Nuevo nombre' }).expect(422);

    expect(response.body.code).toBe('GROUP_FROZEN');
  });

  it('CA-001-11 y CA-001-10: un miembro recibe 403, un ajeno 404 y sin sesión 401', async () => {
    const group = await groupWithCharges();
    const stranger = await harness.insertUser();

    await patch(group.memberIds[0] as string, group.id, { name: 'Intruso' }).expect(403);
    await patch(stranger, group.id, { name: 'Intruso' }).expect(404);
    await request(harness.app.getHttpServer())
      .patch(`/groups/${group.id}`)
      .send({ name: 'Intruso' })
      .expect(401);
    expect(await groupRow(group.id)).toMatchObject({ name: 'Grupo' });
  });
});
