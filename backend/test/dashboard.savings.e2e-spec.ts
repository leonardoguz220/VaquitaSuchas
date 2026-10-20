import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Ahorro estimado del panel (spec 006, US1, T008).
describe('Panel: ahorro estimado', () => {
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);
  let owner: string;
  let member: string;
  let other: string;

  const dashboard = (userId: string, query = ''): request.Test =>
    request(harness.app.getHttpServer())
      .get(`/me/dashboard${query}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    owner = await harness.insertUser();
    member = await harness.insertUser();
    other = await harness.insertUser();
  });

  it('CA-006-04: precio individual USD 10,00 a 6,96 y cuota Bs 20,00 ahorra Bs 49,60', async () => {
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member, other],
      individual: { cents: 1000, currency: 'USD' },
    });
    // USD 8,62 × 6,96 = Bs 60,00 entre 3 personas: cuota de Bs 20,00. El ciclo guarda el tipo de
    // cambio con el que se convierte el precio individual.
    await fixtures.cycle(group, '2026-10', { usd: { priceCents: 862, rate: 6.96 } });
    await fixtures.charge(group, member);

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.body.savings).toMatchObject({
      totalCents: 4960,
      estimated: true,
      withoutData: [],
      negativeNote: null,
    });
    expect(response.body.savings.lines).toEqual([
      expect.objectContaining({
        individualPriceBsCents: 6960,
        shareCents: 2000,
        savingsCents: 4960,
      }),
    ]);
  });

  it('CA-006-05: sin precio individual la suscripción sale como «sin dato»', async () => {
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      serviceName: 'Sin referencia',
    });
    await fixtures.charge(group, member, { amountCents: 2000 });

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.body.savings.totalCents).toBeNull();
    expect(response.body.savings.lines).toEqual([]);
    expect(response.body.savings.withoutData).toEqual([
      { groupId: group.id, serviceName: 'Sin referencia' },
    ]);
  });

  it('CA-006-05: precio en USD y grupo en Bs también es «sin dato», sin romper las demás', async () => {
    const usdOnly = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      serviceName: 'USD sin cambio',
      individual: { cents: 1000, currency: 'USD' },
    });
    const bs = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      serviceName: 'En Bs',
      individual: { cents: 5000, currency: 'BS' },
    });
    await fixtures.charge(usdOnly, member, { amountCents: 2000 });
    await fixtures.charge(bs, member, { amountCents: 3000 });

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.body.savings.totalCents).toBe(2000);
    expect(response.body.savings.withoutData).toEqual([
      { groupId: usdOnly.id, serviceName: 'USD sin cambio' },
    ]);
  });

  it('CA-006-21: un ahorro negativo trae signo y la nota explicativa', async () => {
    const group = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      individual: { cents: 1500, currency: 'BS' },
    });
    await fixtures.charge(group, member, { amountCents: 2000 });

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.body.savings.totalCents).toBe(-500);
    expect(response.body.savings.negativeNote).toEqual(expect.any(String));
  });
});
