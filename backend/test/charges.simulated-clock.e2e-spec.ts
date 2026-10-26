import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Revisión del titular sobre un cobro emitido con fecha simulada futura (tick con `?now=`,
// RF-000-14). Fuera de producción usa `issued_at` como hora mínima; en producción no cambia nada.
describe('Revisión de un cobro de fecha simulada', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let ownerId: string;
  let member: string;
  let seq = 0;
  const originalEnv = process.env.NODE_ENV;

  const post = (chargeId: string, action: string, body: object = {}): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/${action}`)
      .set('Authorization', `Bearer ${harness.token(ownerId)}`)
      .send(body);

  /** Cobro emitido un mes después del reloj real de la prueba (2026-10-16). */
  async function futureCharge(
    status: 'pendiente' | 'en_revision' = 'en_revision',
  ): Promise<string> {
    seq += 1;
    return harness.insertCharge(group, member, {
      status,
      period: `${2030 + seq}-01`,
      issuedAt: '2026-11-15T12:00:00.000Z',
      dueAt: '2026-11-18T12:00:00.000Z',
    });
  }

  const paidAt = async (id: string): Promise<string | null> => {
    const { rows } = await harness.pool.query<{ paid_at: Date | null }>(
      'SELECT paid_at FROM charges WHERE id = $1',
      [id],
    );
    return rows[0]?.paid_at?.toISOString() ?? null;
  };

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    ownerId = group.ownerId;
    member = (group.memberIds as [string])[0];
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('confirm: en test paga con paid_at = issued_at en vez de responder 500', async () => {
    const chargeId = await futureCharge();
    const response = await post(chargeId, 'confirm').expect(200);
    expect(response.body).toMatchObject({ status: 'pagado', paidAt: '2026-11-15T12:00:00.000Z' });
    expect(await paidAt(chargeId)).toBe('2026-11-15T12:00:00.000Z');
  });

  it('manual-payment sin paidAt: también usa el instante simulado', async () => {
    const chargeId = await futureCharge('pendiente');
    const response = await post(chargeId, 'manual-payment', { note: 'Efectivo' }).expect(200);
    expect(response.body).toMatchObject({ status: 'pagado', paidAt: '2026-11-15T12:00:00.000Z' });
  });

  it('reject: registra el evento en el instante simulado y el cobro vuelve a pendiente', async () => {
    const chargeId = await futureCharge();
    await post(chargeId, 'reject', { reason: 'Monto incorrecto', invalidReceipt: false }).expect(
      200,
    );
    const { rows } = await harness.pool.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM charge_events WHERE charge_id = $1 AND type = 'rechazado'`,
      [chargeId],
    );
    expect(rows[0]?.occurred_at.toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  it('en producción no cambia nada: se usa la hora real y la restricción sigue protegiendo', async () => {
    const chargeId = await futureCharge();
    process.env.NODE_ENV = 'production';
    await post(chargeId, 'confirm').expect(500);
    process.env.NODE_ENV = originalEnv;
    expect(await paidAt(chargeId)).toBeNull();
  });
});
