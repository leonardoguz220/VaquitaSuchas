import request from 'supertest';
import { ChargesRepository } from '../src/modules/billing/repositories/charges.repository.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { uploadReceipt } from './support/receipt-files.js';

// Deuda del miembro retirado por mora (spec 002, US8, T031): RN-002-07, RN-002-11, CA-002-31 y
// CA-002-32. El retiro lo hace el barrido de atrasos al actuar sobre el grupo (research R2).
const OVERDUE = '2026-10-16T10:00:00.000Z';

describe('Deuda del miembro retirado', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let retired: string;
  let stays: string;
  let debtId: string;

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  const post = (userId: string, url: string, body: object = {}): request.Test =>
    request(harness.app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);

  const isActive = async (userId: string): Promise<boolean> =>
    (
      await harness.pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL',
        [group.id, userId],
      )
    ).rowCount === 1;

  const status = async (chargeId: string): Promise<string> =>
    (await harness.pool.query('SELECT status FROM charges WHERE id = $1', [chargeId])).rows[0]
      .status;

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    [retired, stays] = group.memberIds as [string, string];
    debtId = await harness.insertCharge(group, retired, { dueAt: OVERDUE });
    await harness.insertCharge(group, stays, { dueAt: '2099-01-01T04:00:00.000Z' });
    // El titular consulta el grupo: el barrido marca el atraso y retira a `retired` por mora.
    await get(group.ownerId, `/groups/${group.id}/charges`).expect(200);
    expect(await isActive(retired)).toBe(false);
    expect(await status(debtId)).toBe('atrasado');
  });

  it('CA-002-31: el retirado sube su comprobante, el titular lo confirma y la deuda desaparece sin volver al grupo', async () => {
    await uploadReceipt(harness, retired, debtId, { reference: 'DEUDA-1' }).expect(201);
    expect(await status(debtId)).toBe('en_revision');

    const confirmed = await post(group.ownerId, `/charges/${debtId}/confirm`).expect(200);

    expect(confirmed.body.status).toBe('pagado');
    const db = harness.app.get(DbService, { strict: false });
    const charges = harness.app.get(ChargesRepository, { strict: false });
    expect(await charges.hasOverdue(db, retired)).toBe(false);
    expect(await isActive(retired)).toBe(false);
    const mine = await get(retired, '/me/charges').expect(200);
    expect(mine.body.items).toEqual([]);
  });

  it('CA-002-32: el retirado solo ve su deuda; el grupo y el resto de cobros le responden 404', async () => {
    const mine = await get(retired, '/me/charges').expect(200);

    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ id: debtId, status: 'atrasado' });
    await get(retired, `/groups/${group.id}/charges`).expect(404);
    await get(retired, `/groups/${group.id}/billing/summary`).expect(404);
    const other = await harness.pool.query<{ id: string }>(
      'SELECT id FROM charges WHERE user_id = $1',
      [stays],
    );
    await get(retired, `/charges/${other.rows[0]?.id}`).expect(404);
    await get(retired, `/charges/${debtId}`).expect(200);
  });

  it('RN-002-07: el cobro atrasado del retirado se conserva y el titular lo ve como deuda de un ex miembro', async () => {
    const history = await get(group.ownerId, `/groups/${group.id}/charges?status=atrasado`).expect(
      200,
    );

    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({
      id: debtId,
      status: 'atrasado',
      member: { isFormerMember: true },
    });
  });

  it('RN-002-07: solo el titular cancela la deuda del retirado y entonces ya no debe nada', async () => {
    await post(retired, `/charges/${debtId}/cancel`, { reason: 'No corresponde' }).expect(403);

    const cancelled = await post(group.ownerId, `/charges/${debtId}/cancel`, {
      reason: 'Acuerdo con el miembro',
    }).expect(200);

    expect(cancelled.body.status).toBe('cancelado');
    const db = harness.app.get(DbService, { strict: false });
    const charges = harness.app.get(ChargesRepository, { strict: false });
    expect(await charges.hasOverdue(db, retired)).toBe(false);
    expect(await isActive(retired)).toBe(false);
  });

  it('RN-002-11: mientras tenga un cobro atrasado en el grupo se sabe que debe (bloquea nuevas solicitudes, spec 010)', async () => {
    const db = harness.app.get(DbService, { strict: false });
    const charges = harness.app.get(ChargesRepository, { strict: false });

    expect(await charges.hasOverdue(db, retired)).toBe(true);
    expect(await charges.hasOverdue(db, stays)).toBe(false);
  });
});
