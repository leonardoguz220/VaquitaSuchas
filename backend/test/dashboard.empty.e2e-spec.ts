import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Estado vacío del panel (spec 006, T010).
describe('Panel: estado vacío', () => {
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

  it('CA-006-14: sin grupos todo va en cero, sin «me deben» y no es un error', async () => {
    const user = await harness.insertUser();

    const response = await get(user, '/me/dashboard').expect(200);

    expect(response.body).toMatchObject({
      isEmpty: true,
      hasGroups: false,
      availableMonths: [],
      spend: { totalCents: 0, paidCents: 0, lines: [] },
      savings: { totalCents: null, lines: [], withoutData: [] },
      debts: { totalCents: 0, count: 0, inReviewCents: 0, inReviewCount: 0 },
      owed: null,
      collection: [],
    });
  });

  it('CA-006-14: con grupo pero sin datos del mes distingue hasGroups', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    await fixtures.createGroup({ ownerId: owner, memberIds: [member] });

    const response = await get(member, '/me/dashboard?month=2026-10').expect(200);

    expect(response.body).toMatchObject({ isEmpty: true, hasGroups: true });
  });
});
