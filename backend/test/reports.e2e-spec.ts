import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Reporte y exclusión de un cobro mal calificado (spec 007, US4, T029/T030).
describe('Reputación: reportes y exclusiones', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);

  const post = (userId: string, chargeId: string, action: string, body: object): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/${action}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);

  async function setup() {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    const chargeId = await fixtures.fact(group, user, { status: 'atrasado', submittedAt: null });
    return { owner, user, stranger, chargeId };
  }

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-007-13: el titular excluye el cobro reportado, queda registrado y se recalcula', async () => {
    const { owner, user, chargeId } = await setup();
    await post(user, chargeId, 'reputation-report', {
      comment: 'Pagué a tiempo, el sistema falló',
    }).expect(201);

    const response = await post(owner, chargeId, 'reputation-exclusion', {
      reason: 'Error del sistema al registrar el pago',
    }).expect(200);

    expect(response.body).toEqual({ chargeId, excluded: true });
    const saved = await harness.pool.query(
      `SELECT excluded_by, excluded_at FROM charge_reputation_exclusions WHERE charge_id = $1`,
      [chargeId],
    );
    expect(saved.rows[0]).toMatchObject({ excluded_by: owner, excluded_at: expect.any(Date) });
    const report = await harness.pool.query(
      `SELECT status, decided_by FROM reputation_reports WHERE charge_id = $1`,
      [chargeId],
    );
    expect(report.rows[0]).toMatchObject({ status: 'excluido', decided_by: owner });
    const stored = await harness.pool.query(
      `SELECT considered_count FROM user_reputation WHERE user_id = $1`,
      [user],
    );
    expect(stored.rows[0]).toMatchObject({ considered_count: 0 });
    const detail = await request(harness.app.getHttpServer())
      .get('/users/me/reputation')
      .set('Authorization', `Bearer ${harness.token(user)}`)
      .expect(200);
    expect(detail.body.recent[0]).toMatchObject({ chargeId, countsForRating: false });
  });

  it('CHARGE_ALREADY_EXCLUDED: ni se reporta ni se vuelve a excluir un cobro excluido', async () => {
    const { owner, user, chargeId } = await setup();
    await post(owner, chargeId, 'reputation-exclusion', {
      reason: 'Error del sistema al registrar',
    }).expect(200);

    const again = await post(owner, chargeId, 'reputation-exclusion', {
      reason: 'Otra vez el mismo motivo',
    }).expect(422);
    const report = await post(user, chargeId, 'reputation-report', {
      comment: 'Reporte tardío del cobro',
    }).expect(422);

    expect(JSON.stringify(again.body)).toContain('CHARGE_ALREADY_EXCLUDED');
    expect(JSON.stringify(report.body)).toContain('CHARGE_ALREADY_EXCLUDED');
  });

  it('REPORT_ALREADY_SENT: la misma persona no reporta dos veces el mismo cobro', async () => {
    const { user, chargeId } = await setup();
    await post(user, chargeId, 'reputation-report', { comment: 'Pagué a tiempo, revisen' }).expect(
      201,
    );

    const second = await post(user, chargeId, 'reputation-report', {
      comment: 'Insisto, pagué a tiempo',
    }).expect(422);

    expect(JSON.stringify(second.body)).toContain('REPORT_ALREADY_SENT');
  });

  it('solo el titular excluye y solo el dueño reporta', async () => {
    const { owner, user, stranger, chargeId } = await setup();
    const other = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user, other] });
    const othersCharge = await fixtures.fact(group, other, {
      status: 'atrasado',
      submittedAt: null,
    });

    await post(user, chargeId, 'reputation-exclusion', { reason: 'Quiero que me excluyan' }).expect(
      403,
    );
    await post(owner, chargeId, 'reputation-report', {
      comment: 'El titular no es el dueño',
    }).expect(403);
    await post(user, othersCharge, 'reputation-report', {
      comment: 'Es el cobro de otra persona',
    }).expect(403);
    await post(stranger, chargeId, 'reputation-report', { comment: 'No soy del grupo' }).expect(
      404,
    );
    await post(stranger, chargeId, 'reputation-exclusion', { reason: 'No soy del grupo' }).expect(
      404,
    );
  });

  it('valida el texto (10 a 300) y el cobro inexistente responde 404', async () => {
    const { owner, user, chargeId } = await setup();

    await post(user, chargeId, 'reputation-report', { comment: 'corto' }).expect(400);
    await post(owner, chargeId, 'reputation-exclusion', { reason: 'x'.repeat(301) }).expect(400);
    await post(user, '00000000-0000-4000-8000-000000000000', 'reputation-report', {
      comment: 'Un comentario válido',
    }).expect(404);
  });
});
