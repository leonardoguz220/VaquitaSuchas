import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Acceso al panel (spec 006, T008): solo se ve lo propio; el identificador sale del token.
describe('Panel: acceso', () => {
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

  it('CA-006-18: el panel de un grupo ajeno responde 404, también en las listas', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, { amountCents: 3000 });

    await get(stranger, `/me/dashboard?groupId=${group.id}`).expect(404);
    await get(stranger, `/me/dashboard/lists?list=debts&groupId=${group.id}`).expect(404);
    await get(stranger, `/me/dashboard?groupId=${randomUUID()}`).expect(404);
    await get(member, `/me/dashboard?groupId=${group.id}`).expect(200);
  });

  it('una persona ajena ve su panel vacío, sin datos de otros', async () => {
    const owner = await harness.insertUser();
    const member = await harness.insertUser();
    const stranger = await harness.insertUser();
    const group = await fixtures.createGroup({ ownerId: owner, memberIds: [member] });
    await fixtures.charge(group, member, { amountCents: 3000 });

    const response = await get(stranger, '/me/dashboard?month=2026-10').expect(200);

    expect(response.body).toMatchObject({
      isEmpty: true,
      hasGroups: false,
      spend: { totalCents: 0, lines: [] },
      debts: { totalCents: 0, count: 0 },
    });
  });

  it('exige sesión y valida el mes', async () => {
    await request(harness.app.getHttpServer()).get('/me/dashboard').expect(401);
    const user = await harness.insertUser();
    await get(user, '/me/dashboard?month=2026-13').expect(400);
    await get(user, '/me/dashboard?groupId=no-es-uuid').expect(400);
  });
});
