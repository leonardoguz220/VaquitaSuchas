import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Los meses pasados usan las copias del ciclo y del cobro (spec 006, RN-006-06, T010).
describe('Panel: histórico', () => {
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

  it('CA-006-10: cambiar el precio del grupo no altera los meses anteriores', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      individual: { cents: 5000, currency: 'BS' },
    });
    await fixtures.charge(group, member, { period: '2026-09', amountCents: 2500 });
    const before = await get(member, '/me/dashboard?month=2026-09').expect(200);

    await harness.pool.query(`UPDATE groups SET price_cents = 99900 WHERE id = $1`, [group.id]);
    const after = await get(member, '/me/dashboard?month=2026-09').expect(200);

    expect(after.body.spend).toEqual(before.body.spend);
    expect(after.body.savings).toEqual(before.body.savings);
    expect(after.body.spend.totalCents).toBe(2500);
  });
});
