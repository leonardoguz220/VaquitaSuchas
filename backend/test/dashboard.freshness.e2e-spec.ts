import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Frescura del panel (spec 006, RNF-006-02, T010): sin caché ni datos de otra persona.
describe('Panel: frescura', () => {
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

  it('CA-006-20: un cobro que pasa a pagado se refleja en la siguiente consulta', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    const chargeId = await fixtures.charge(group, member, { amountCents: 3000 });
    const before = await get(member, '/me/dashboard?month=2026-10').expect(200);
    expect(before.body.debts.totalCents).toBe(3000);
    expect(before.body.spend.paidCents).toBe(0);

    await harness.pool.query(
      `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2, settlement = 'manual'
        WHERE id = $1`,
      [chargeId, owner],
    );
    const after = await get(member, '/me/dashboard?month=2026-10').expect(200);

    expect(after.body.debts.totalCents).toBe(0);
    expect(after.body.spend.paidCents).toBe(3000);
    expect(after.headers['cache-control']).toBe('private, no-store');
  });
});
