import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { LATE, ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Hechos que puntúan (spec 007, T008): la calificación sale de los cobros guardados.
// CA-007-22 (el cobro de ingreso no cuenta) tiene su prueba en domain/score.spec.ts.
describe('Reputación: hechos de los cobros', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);

  const get = (userId: string, url = '/users/me/reputation'): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  async function setup(): Promise<{
    owner: string;
    member: string;
    group: Awaited<ReturnType<typeof fixtures.reports.createGroup>>;
  }> {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [member] });
    return { owner, member, group };
  }

  it('CA-007-05: subido a tiempo, rechazado y vuelto a subir tarde, cuenta como puntual', async () => {
    const { owner, member, group } = await setup();
    const chargeId = await fixtures.fact(group, member);
    await fixtures.rejection(chargeId, group.id, owner, false);
    await fixtures.receipt(chargeId, member, LATE);

    const response = await get(member).expect(200);

    expect(response.body).toMatchObject({ consideredCount: 1, punctualCount: 1, lateCount: 0 });
  });

  it('CA-007-25: con «comprobante inválido» se mide con la última subida', async () => {
    const { owner, member, group } = await setup();
    const chargeId = await fixtures.fact(group, member);
    await fixtures.rejection(chargeId, group.id, owner, true);
    await fixtures.receipt(chargeId, member, LATE);

    const response = await get(member).expect(200);

    expect(response.body).toMatchObject({ consideredCount: 1, punctualCount: 0, lateCount: 1 });
    expect(response.body.recent[0]).toMatchObject({ result: 'tardio', countsForRating: true });
  });

  it('CA-007-24: el cobro atrasado de quien salió por mora cuenta tardío, aunque lo pague después', async () => {
    const { member, group } = await setup();
    await fixtures.fact(group, member, { status: 'atrasado', submittedAt: null });
    await harness.leaveGroup(group.id, member, 'mora');
    expect((await get(member).expect(200)).body).toMatchObject({
      consideredCount: 1,
      lateCount: 1,
    });

    const paid = await fixtures.fact(group, member, {
      period: '2026-07',
      manualPaidAt: '2026-08-25T12:00:00Z',
    });
    expect(paid).toEqual(expect.any(String));
    const response = await get(member).expect(200);
    expect(response.body).toMatchObject({ consideredCount: 2, punctualCount: 0, lateCount: 2 });
  });

  it('CA-007-06: un cobro cancelado no cuenta; uno excluido aparece sin contar', async () => {
    const { owner, member, group } = await setup();
    await fixtures.fact(group, member, { period: '2026-06', status: 'cancelado' });
    const excluded = await fixtures.fact(group, member, { period: '2026-07' });
    await fixtures.fact(group, member, { period: '2026-08' });
    await harness.pool.query(
      `INSERT INTO charge_reputation_exclusions (charge_id, reason, excluded_by)
       VALUES ($1, 'Error del titular al calificar', $2)`,
      [excluded, owner],
    );

    const response = await get(member).expect(200);

    expect(response.body.consideredCount).toBe(1);
    const flags = response.body.recent.map((r: { chargeId: string; countsForRating: boolean }) => [
      r.chargeId === excluded,
      r.countsForRating,
    ]);
    expect(flags).toContainEqual([true, false]);
  });

  it('CA-007-17: el cliente no puede mover la calificación con fechas ni parámetros', async () => {
    const { member, group } = await setup();
    await fixtures.fact(group, member, { status: 'atrasado', submittedAt: null });

    const response = await get(
      member,
      '/users/me/reputation?now=2030-01-01&paidAt=2026-08-01',
    ).expect(200);

    expect(response.body).toMatchObject({ consideredCount: 1, lateCount: 1 });
    // Un miembro tampoco puede registrar un pago manual con la fecha que quiera.
    const chargeId = response.body.recent[0].chargeId as string;
    await request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/manual-payment`)
      .set('Authorization', `Bearer ${harness.token(member)}`)
      .send({ paidAt: '2026-08-01T00:00:00Z' })
      .expect(403);
  });
});
