import request from 'supertest';
import { ChargesService } from '../src/modules/billing/services/charges.service.js';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import {
  CHARGE_FACTS_PORT,
  type ChargeFactsPort,
} from '../src/modules/billing/ports/charge-facts.port.js';
import { DbService, type DbTransaction } from '../src/shared/db/db.service.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';

// Cobro de ingreso (spec 002, T039): lo crea la spec 010 al aceptar una solicitud, dentro de su
// transacción y después de `ensureCurrentCycle`. PostgreSQL real, sin mocks.
describe('Cobro de ingreso (createEntryCharge)', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let titular: string;
  let members: string[];
  let charges: ChargesService;
  let billingCycles: BillingCyclesService;
  let db: DbService;
  let runner: JobRunner;

  const snapshot = {
    priceCents: 10001,
    currency: 'BS' as const,
    exchangeRate: null,
    totalBsCents: 10001,
    memberCount: 4,
  };
  const proof = (reference = 'REF-INGRESO-1') => ({
    fileKey: 'receipts/ingreso/entrada.png',
    mime: 'image/png' as const,
    sizeBytes: 4,
    method: 'qr' as const,
    reference,
    uploadedAt: new Date('2026-10-16T14:30:00Z'),
  });

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  async function insertJoinRequest(applicantId: string): Promise<string> {
    const result = await harness.pool.query<{ id: string }>(
      `INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
       VALUES ($1, $2, '2026-10-16T14:00:00Z', '2026-10-17T14:00:00Z') RETURNING id`,
      [group.id, applicantId],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async function addMember(tx: DbTransaction, userId: string, requestId: string): Promise<void> {
    await tx.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
       VALUES ($1, $2, 'miembro', 'solicitud', $3)`,
      [group.id, userId, requestId],
    );
  }

  /** Secuencia de la spec 010 (research R2): ciclo, alta del miembro y cobro de ingreso. */
  async function accept(
    applicantId: string,
    requestId: string,
    options: { withProof?: boolean } = {},
  ) {
    return db.withTransaction(async (tx) => {
      await billingCycles.ensureCurrentCycle(tx, group.id, new Date(NOW));
      await addMember(tx, applicantId, requestId);
      return charges.createEntryCharge(tx, {
        groupId: group.id,
        userId: applicantId,
        joinRequestId: requestId,
        amountCents: 2501,
        snapshot,
        proof: options.withProof === false ? null : proof(),
      });
    });
  }

  const chargesOf = async (userId: string) =>
    (
      await harness.pool.query<{ id: string; status: string; origin: string; settlement: string }>(
        `SELECT id, status, origin, settlement FROM charges WHERE group_id = $1 AND user_id = $2`,
        [group.id, userId],
      )
    ).rows;

  beforeAll(async () => {
    await harness.start();
    charges = harness.app.get(ChargesService, { strict: false });
    billingCycles = harness.app.get(BillingCyclesService, { strict: false });
    db = harness.app.get(DbService, { strict: false });
    runner = harness.app.get(JobRunner, { strict: false });
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2, ownerName: 'Titular Suchas' });
    titular = group.ownerId;
    members = group.memberIds;
    harness.storage.files.clear();
  });

  it('RN-002-10: el cobro nace pagado, de origen e liquidación ingreso, con la copia cotizada y su evento', async () => {
    const applicant = await harness.insertUser('Nuevo Miembro');
    const requestId = await insertJoinRequest(applicant);

    const { charge, created } = await accept(applicant, requestId);

    expect(created).toBe(true);
    expect(charge).toMatchObject({
      groupId: group.id,
      userId: applicant,
      period: '2026-10',
      cycleId: group.cycleId,
      origin: 'ingreso',
      joinRequestId: requestId,
      status: 'pagado',
      settlement: 'ingreso',
      settledBy: titular,
      amountCents: 2501,
      priceCents: 10001,
      currency: 'BS',
      totalBsCents: 10001,
      memberCount: 4,
    });
    expect(Number.isInteger(charge.amountCents)).toBe(true);
    expect(charge.paidAt?.toISOString()).toBe(NOW);

    const events = await harness.pool.query(
      `SELECT type, actor_id, from_status, to_status, metadata FROM charge_events WHERE charge_id = $1`,
      [charge.id],
    );
    expect(events.rows).toEqual([
      expect.objectContaining({
        type: 'ingreso_registrado',
        actor_id: titular,
        from_status: null,
        to_status: 'pagado',
        metadata: expect.objectContaining({ joinRequestId: requestId, method: 'comprobante' }),
      }),
    ]);
    const receipt = await harness.pool.query(
      `SELECT status, reference, uploaded_by FROM receipts WHERE charge_id = $1`,
      [charge.id],
    );
    expect(receipt.rows).toEqual([
      { status: 'confirmado', reference: 'REF-INGRESO-1', uploaded_by: applicant },
    ]);
  });

  it('RN-002-10: un ingreso en efectivo no lleva comprobante', async () => {
    const applicant = await harness.insertUser();
    const requestId = await insertJoinRequest(applicant);

    const { charge } = await accept(applicant, requestId, { withProof: false });

    const receipts = await harness.pool.query(`SELECT 1 FROM receipts WHERE charge_id = $1`, [
      charge.id,
    ]);
    expect(receipts.rowCount).toBe(0);
    const event = await harness.pool.query(
      `SELECT metadata FROM charge_events WHERE charge_id = $1`,
      [charge.id],
    );
    expect(event.rows[0]?.metadata).toMatchObject({ method: 'efectivo' });
  });

  it('CA-002-24: la generación del período no crea un segundo cobro y el de ingreso sigue pagado', async () => {
    // El período aún no tiene ciclo: createEntryCharge lo crea con ensureCurrentCycle ANTES del alta.
    await harness.pool.query(`DELETE FROM billing_cycles WHERE group_id = $1`, [group.id]);
    const applicant = await harness.insertUser();
    const requestId = await insertJoinRequest(applicant);

    const { charge } = await accept(applicant, requestId);

    const cycle = await harness.pool.query(
      `SELECT id, member_count FROM billing_cycles WHERE group_id = $1 AND period = '2026-10'`,
      [group.id],
    );
    expect(cycle.rowCount).toBe(1);
    expect(charge.cycleId).toBe(cycle.rows[0].id);
    // El ciclo se emitió antes del alta: los cobros de ciclo son solo de los miembros previos.
    expect((await chargeCount()).byUser[applicant]).toBe(1);

    const results = await runner.runAll('manual', { job: 'billing.generate' });
    expect(results).toEqual([expect.objectContaining({ job: 'billing.generate', status: 'ok' })]);

    expect(await chargesOf(applicant)).toEqual([
      expect.objectContaining({ id: charge.id, status: 'pagado', origin: 'ingreso' }),
    ]);
    expect((await chargeCount()).total).toBe(3);
  });

  async function chargeCount(): Promise<{ total: number; byUser: Record<string, number> }> {
    const rows = await harness.pool.query<{ user_id: string; n: string }>(
      `SELECT user_id, count(*) AS n FROM charges WHERE group_id = $1 GROUP BY user_id`,
      [group.id],
    );
    const byUser: Record<string, number> = {};
    for (const row of rows.rows) byUser[row.user_id] = Number(row.n);
    return { total: Object.values(byUser).reduce((a, b) => a + b, 0), byUser };
  }

  it('CA-002-24: si la persona ya tiene un cobro no cancelado en el período, no se crea otro', async () => {
    const existingId = await harness.insertCharge(group, members[0] as string);
    // Ese cobro pertenece a una solicitud ficticia: lo importante es que no se duplica.
    const requestId = await insertJoinRequest(await harness.insertUser());

    const result = await db.withTransaction((tx) =>
      charges.createEntryCharge(tx, {
        groupId: group.id,
        userId: members[0] as string,
        joinRequestId: requestId,
        amountCents: 2501,
        snapshot,
        proof: proof(),
      }),
    );

    expect(result.created).toBe(false);
    expect(result.charge.id).toBe(existingId);
    expect(result.charge.status).toBe('pendiente');
    expect(await chargesOf(members[0] as string)).toHaveLength(1);
    const side = await harness.pool.query(`SELECT 1 FROM receipts WHERE charge_id = $1`, [
      existingId,
    ]);
    expect(side.rowCount).toBe(0);
  });

  it('CA-002-24: repetir la llamada con la misma solicitud es idempotente', async () => {
    const applicant = await harness.insertUser();
    const requestId = await insertJoinRequest(applicant);
    const first = await accept(applicant, requestId);

    const second = await db.withTransaction((tx) =>
      charges.createEntryCharge(tx, {
        groupId: group.id,
        userId: applicant,
        joinRequestId: requestId,
        amountCents: 2501,
        snapshot,
        proof: proof('REF-OTRA'),
      }),
    );

    expect(second).toMatchObject({ created: false });
    expect(second.charge.id).toBe(first.charge.id);
    expect(await chargesOf(applicant)).toHaveLength(1);
  });

  it('CA-002-24: un cobro cancelado del período no impide el de ingreso', async () => {
    const applicant = await harness.insertUser();
    const old = await harness.insertCharge(group, applicant);
    await harness.pool.query(
      `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                          cancel_reason = 'Salió del grupo' WHERE id = $1`,
      [old, titular],
    );
    const requestId = await insertJoinRequest(applicant);

    const { charge, created } = await db.withTransaction((tx) =>
      charges.createEntryCharge(tx, {
        groupId: group.id,
        userId: applicant,
        joinRequestId: requestId,
        amountCents: 2501,
        snapshot,
        proof: null,
      }),
    );

    expect(created).toBe(true);
    expect(charge.id).not.toBe(old);
    expect(await chargesOf(applicant)).toHaveLength(2);
  });

  it('RF-002-19: si la transacción del llamador falla, no queda cobro ni comprobante', async () => {
    const applicant = await harness.insertUser();
    const requestId = await insertJoinRequest(applicant);

    await expect(
      db.withTransaction(async (tx) => {
        await addMember(tx, applicant, requestId);
        await charges.createEntryCharge(tx, {
          groupId: group.id,
          userId: applicant,
          joinRequestId: requestId,
          amountCents: 2501,
          snapshot,
          proof: proof(),
        });
        throw new Error('falla posterior de la spec 010');
      }),
    ).rejects.toThrow('falla posterior');

    expect(await chargesOf(applicant)).toHaveLength(0);
    const receipts = await harness.pool.query(`SELECT 1 FROM receipts WHERE uploaded_by = $1`, [
      applicant,
    ]);
    expect(receipts.rowCount).toBe(0);
  });

  it('CA-002-25: el cobro de ingreso aparece pagado en el historial, con línea de tiempo y comprobante solo para el titular y el miembro', async () => {
    const applicant = await harness.insertUser('Nuevo Miembro');
    const requestId = await insertJoinRequest(applicant);
    const { charge } = await accept(applicant, requestId);

    const asTitular = await get(titular, `/groups/${group.id}/charges`).expect(200);
    const item = asTitular.body.items.find((c: { id: string }) => c.id === charge.id);
    expect(item).toMatchObject({
      origin: 'ingreso',
      status: 'pagado',
      amountCents: 2501,
      settlement: 'ingreso',
      receipts: [expect.objectContaining({ status: 'confirmado', reference: 'REF-INGRESO-1' })],
      timeline: [expect.objectContaining({ type: 'ingreso_registrado' })],
    });

    const asOther = await get(members[0] as string, `/groups/${group.id}/charges`).expect(200);
    const publicItem = asOther.body.items.find((c: { id: string }) => c.id === charge.id);
    expect(publicItem).toMatchObject({
      origin: 'ingreso',
      status: 'pagado',
      member: { userId: applicant, fullName: 'Nuevo Miembro', isFormerMember: false },
      timeline: [
        { type: 'ingreso_registrado', actor: { userId: titular, fullName: 'Titular Suchas' } },
      ],
    });
    expect(JSON.stringify(publicItem)).not.toContain('REF-INGRESO-1');
    expect(publicItem).not.toHaveProperty('receipts');

    // Detalle: el titular y el propio miembro ven el comprobante; otro miembro recibe 403.
    const detail = await get(applicant, `/charges/${charge.id}`).expect(200);
    expect(detail.body.receipts).toEqual([
      expect.objectContaining({ reference: 'REF-INGRESO-1', status: 'confirmado' }),
    ]);
    await get(titular, `/charges/${charge.id}`).expect(200);
    await get(members[0] as string, `/charges/${charge.id}`).expect(403);

    const summary = await get(titular, `/groups/${group.id}/billing/summary`).expect(200);
    expect(summary.body.rows.map((r: { charge: { id: string } }) => r.charge.id)).toContain(
      charge.id,
    );
    expect(summary.body.ownerTotals.collectedCents).toBe(2501);
  });

  it('RN-002-10: los hechos para la reputación marcan el cobro como de ingreso (no puntúa)', async () => {
    const applicant = await harness.insertUser();
    const requestId = await insertJoinRequest(applicant);
    await accept(applicant, requestId);
    const facts = harness.app.get<ChargeFactsPort>(CHARGE_FACTS_PORT, { strict: false });

    const list = await facts.listForUsers(
      harness.pool,
      [applicant],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(list).toEqual([
      expect.objectContaining({ origin: 'ingreso', settlement: 'ingreso', status: 'pagado' }),
    ]);
  });
});
