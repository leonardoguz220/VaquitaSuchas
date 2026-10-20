import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';
import { ReportsFixtures, type ReportsGroup } from './support/reports-fixtures.js';
import { ReportsModule } from '../src/modules/reports/reports.module.js';

// Gasto del mes del panel (spec 006, US1, T008) contra PostgreSQL real.
describe('Panel: gasto del mes', () => {
  const harness = new BillingHarness({ imports: [ReportsModule] });
  const fixtures = new ReportsFixtures(harness);
  let owner: string;
  let member: string;
  let netflix: ReportsGroup;
  let spotify: ReportsGroup;

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
    owner = await harness.insertUser('Titular Suchas');
    member = await harness.insertUser('Miembro Suchas');
    netflix = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      serviceName: 'Netflix',
    });
    spotify = await fixtures.createGroup({
      ownerId: owner,
      memberIds: [member],
      serviceName: 'Spotify',
    });
  });

  it('CA-006-01: cuotas de Bs 30,00 y Bs 25,50 suman Bs 55,50 con su desglose', async () => {
    await fixtures.charge(netflix, member, { amountCents: 3000 });
    await fixtures.charge(spotify, member, { amountCents: 2550, status: 'pagado' });

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.spend.totalCents).toBe(5550);
    expect(response.body.spend.paidCents).toBe(2550);
    const lines = response.body.spend.lines as { serviceName: string; costCents: number }[];
    expect(lines.map((l) => [l.serviceName, l.costCents])).toEqual([
      ['Netflix', 3000],
      ['Spotify', 2550],
    ]);
  });

  it('CA-006-22: la suma del desglose es exactamente el total', async () => {
    await fixtures.charge(netflix, member, { amountCents: 3333 });
    await fixtures.charge(spotify, member, { amountCents: 1667, status: 'en_revision' });

    const response = await dashboard(member).expect(200);

    const lines = response.body.spend.lines as { costCents: number }[];
    expect(lines.reduce((sum, l) => sum + l.costCents, 0)).toBe(response.body.spend.totalCents);
    expect(response.body.spend.totalCents).toBe(5000);
  });

  it('CA-006-02: un cobro cancelado no suma al gasto', async () => {
    await fixtures.charge(netflix, member, { amountCents: 3000 });
    await fixtures.charge(spotify, member, { amountCents: 2550, status: 'cancelado' });

    const response = await dashboard(member, '?month=2026-10').expect(200);

    expect(response.body.spend.totalCents).toBe(3000);
    expect(response.body.spend.lines).toHaveLength(1);
  });

  it('CA-006-03: el gasto del titular es su cuota de referencia y no tiene «pagado»', async () => {
    await fixtures.cycle(netflix, '2026-10', { totalBsCents: 10001 });

    const response = await dashboard(owner, '?month=2026-10').expect(200);

    // 10001 entre 2 personas: base 5000, el titular asume el resto.
    expect(response.body.spend.lines).toEqual([
      expect.objectContaining({
        serviceName: 'Netflix',
        role: 'titular',
        costCents: 5001,
        paidCents: null,
      }),
    ]);
    expect(response.body.spend.totalCents).toBe(5001);
    expect(response.body.spend.paidCents).toBe(0);
  });

  it('RN-006-01: un cobro pagado en otro mes cuenta en su período', async () => {
    await fixtures.charge(netflix, member, {
      amountCents: 3000,
      period: '2026-09',
      status: 'pagado',
    });

    const september = await dashboard(member, '?month=2026-09').expect(200);
    const october = await dashboard(member, '?month=2026-10').expect(200);

    expect(september.body.spend.totalCents).toBe(3000);
    expect(october.body.spend.totalCents).toBe(0);
    expect(september.body.availableMonths).toEqual(['2026-09']);
  });

  it('filtra por suscripción con groupId', async () => {
    await fixtures.charge(netflix, member, { amountCents: 3000 });
    await fixtures.charge(spotify, member, { amountCents: 2550 });

    const response = await dashboard(member, `?month=2026-10&groupId=${spotify.id}`).expect(200);

    expect(response.body.spend.totalCents).toBe(2550);
  });
});
