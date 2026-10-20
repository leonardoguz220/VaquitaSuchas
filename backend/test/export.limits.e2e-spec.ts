import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Límite de filas de la exportación (spec 006, RNF-006-04): se baja a 3 para no sembrar 20.000.
describe('Exportación: límite de filas', () => {
  process.env.EXPORT_MAX_ROWS = '3';
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
    delete process.env.EXPORT_MAX_ROWS;
  }, 30_000);

  it('más filas que el máximo responde 422 EXPORT_TOO_LARGE y no gasta una exportación', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    for (const period of ['2026-06', '2026-07', '2026-08', '2026-09']) {
      await fixtures.charge(group, member, { period, amountCents: 1000 });
    }
    const get = (url: string): request.Test =>
      request(harness.app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${harness.token(member)}`);

    const tooLarge = await get('/me/history/export.csv').expect(422);
    expect(tooLarge.body.code).toBe('EXPORT_TOO_LARGE');
    // Filtrando por período entra en el límite.
    await get('/me/history/export.csv?period=2026-09').expect(200);
  });
});
