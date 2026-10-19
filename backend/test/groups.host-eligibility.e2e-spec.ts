import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';

// Adaptador real de HostEligibilityPort (spec 001 T013) sobre host_enablements (spec 009, 0091).
// Mientras no exista la reputación (spec 007), la vía por calificación responde «no habilitado».
describe('Elegibilidad para ser titular (adaptador real)', () => {
  const harness = new BillingHarness();

  const eligibilityOf = (userId: string): request.Test =>
    request(harness.app.getHttpServer())
      .get('/users/me/host-eligibility')
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  const createGroup = (userId: string): request.Test =>
    request(harness.app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send({
        customServiceName: 'Mi servicio',
        name: 'Grupo de prueba',
        priceCents: 10001,
        currency: 'BS',
        billingDay: 15,
        totalSlots: 3,
      });

  async function enable(userId: string, adminId: string, revoked = false): Promise<void> {
    await harness.pool.query(
      `INSERT INTO host_enablements (user_id, reason, enabled_by, revoked_at, revoked_by, revoke_reason)
       VALUES ($1, 'Habilitación de prueba del administrador', $2,
               CASE WHEN $3::boolean THEN now() END,
               CASE WHEN $3::boolean THEN $2::uuid END,
               CASE WHEN $3::boolean THEN 'Revocada en la prueba' END)`,
      [userId, adminId, revoked],
    );
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('RF-001-21: sin habilitación vigente no está habilitado y ve qué falta', async () => {
    const user = await harness.insertUser();

    const response = await eligibilityOf(user).expect(200);

    expect(response.body).toEqual({
      eligible: false,
      source: null,
      activeGroups: 0,
      maxActiveGroups: 5,
      canCreateMore: true,
      requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
      current: { stars: null, consideredCharges: 0, level: null },
    });
    const created = await createGroup(user).expect(422);
    expect(created.body).toMatchObject({
      code: 'NOT_HOST_ELIGIBLE',
      details: { rule: 'RF-001-21', eligible: false },
    });
  });

  it('CA-001-25: con una habilitación manual vigente está habilitado y crea el grupo', async () => {
    const admin = await harness.insertUser();
    const user = await harness.insertUser();
    await enable(user, admin);

    const response = await eligibilityOf(user).expect(200);
    expect(response.body).toMatchObject({ eligible: true, source: 'manual' });

    await createGroup(user).expect(201);
    const after = await eligibilityOf(user).expect(200);
    expect(after.body).toMatchObject({ activeGroups: 1, canCreateMore: true });
  });

  it('RF-001-21: una habilitación revocada ya no cuenta', async () => {
    const admin = await harness.insertUser();
    const user = await harness.insertUser();
    await enable(user, admin, true);

    const response = await eligibilityOf(user).expect(200);

    expect(response.body).toMatchObject({ eligible: false, source: null });
  });
});
