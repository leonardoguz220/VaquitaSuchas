import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock, type SeedState } from './support/join-requests-fixtures.js';

// Permisos de las solicitudes de ingreso (spec 010 US1, T015, plan §7) contra PostgreSQL real.
describe('Permisos de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let stranger: string;
  let applicant: string;
  let requestId: string;

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(async () => {
    await harness.start();
    group = await harness.createGroup({ members: 2 });
    stranger = await harness.insertUser();
    applicant = await harness.insertUser();
    requestId = await seedRequest(harness, group, applicant, 'abierta');
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => setClock(harness, NOW));

  it('CA-010-20 y RNF-010-01: un ajeno al grupo recibe 404 y un miembro que no participa recibe 403', async () => {
    const member = group.memberIds[0] as string;

    const asStranger = await get(stranger, `/join-requests/${requestId}`).expect(404);
    const asMember = await get(member, `/join-requests/${requestId}`).expect(403);

    expect(asStranger.body.code).toBe('NOT_FOUND');
    expect(asMember.body.code).toBe('FORBIDDEN');
    // El 404 no revela si existe: igual que un identificador inexistente o mal formado.
    const missing = await get(
      stranger,
      '/join-requests/3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    ).expect(404);
    expect(missing.body).toEqual(asStranger.body);
    await get(stranger, '/join-requests/no-es-un-uuid').expect(404);
  });

  it('CA-010-20: el solicitante y el titular acceden; el celular del solicitante nunca se incluye (RNF-010-02)', async () => {
    const asApplicant = await get(applicant, `/join-requests/${requestId}`).expect(200);
    const asHost = await get(group.ownerId, `/join-requests/${requestId}`).expect(200);

    expect(asApplicant.body.id).toBe(requestId);
    expect(asHost.body.id).toBe(requestId);
    expect(JSON.stringify(asHost.body)).not.toMatch(/phone|\+591/);
  });

  it('CA-010-20: un administrador sin relación con el grupo no accede por esta vía (404)', async () => {
    const adminId = await harness.insertUser('Admin');
    await harness.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);

    await get(adminId, `/join-requests/${requestId}`).expect(404);
  });

  it('CA-010-20: la cola del grupo solo la ve el titular (403 miembro, 404 ajeno)', async () => {
    await get(group.ownerId, `/groups/${group.id}/join-requests`).expect(200);
    await get(group.memberIds[0] as string, `/groups/${group.id}/join-requests`).expect(403);
    await get(stranger, `/groups/${group.id}/join-requests`).expect(404);
    await get(stranger, '/groups/3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b/join-requests').expect(404);
  });

  it('CA-010-20: GET /join-requests solo lista las solicitudes propias o de los grupos del titular', async () => {
    const asStranger = await get(stranger, '/join-requests').expect(200);
    const asApplicant = await get(applicant, '/join-requests').expect(200);
    const asMember = await get(group.memberIds[0] as string, '/join-requests').expect(200);

    expect(asStranger.body.items).toEqual([]);
    expect(asMember.body.items).toEqual([]);
    expect(asApplicant.body.items.map((r: { id: string }) => r.id)).toEqual([requestId]);
  });

  // Plan §7: acciones por rol y estado. `allowedActions` es lo único que el cliente dibuja.
  const table: [SeedState, string[], string[]][] = [
    ['abierta', ['cancel', 'sendMessage'], ['sendPaymentData', 'reject', 'sendMessage']],
    [
      'esperando_pago',
      ['uploadProof', 'cancel', 'sendMessage'],
      ['extend', 'cashPayment', 'reject', 'sendMessage'],
    ],
    ['pago_informado', ['sendMessage'], ['confirm', 'reject', 'sendMessage']],
    ['rechazada', [], []],
    ['cancelada', [], []],
    ['expirada', [], []],
  ];

  it.each(table)(
    'RNF-010-01 (plan §7): en %s el solicitante puede %j y el titular %j',
    async (state, applicantActions, hostActions) => {
      const owner = await harness.createGroup({ members: 1 });
      const person = await harness.insertUser();
      const id = await seedRequest(harness, owner, person, state);

      const asApplicant = await get(person, `/join-requests/${id}`).expect(200);
      const asHost = await get(owner.ownerId, `/join-requests/${id}`).expect(200);

      expect(asApplicant.body.allowedActions).toEqual(applicantActions);
      expect(asHost.body.allowedActions).toEqual(hostActions);
    },
  );

  it('RNF-010-01: un estado final no ofrece acciones; un plazo vencido se trata como expirada', async () => {
    const owner = await harness.createGroup({ members: 1 });
    const person = await harness.insertUser();
    const id = await seedRequest(harness, owner, person, 'esperando_pago', {
      openedAt: new Date(Date.parse(NOW) - 25 * 3600_000).toISOString(),
    });
    // Hoy el plazo de pago (apertura + 24 h 15 min) ya venció, aunque nadie lo haya persistido.
    const detail = await get(person, `/join-requests/${id}`).expect(200);

    expect(detail.body.phase.status).toBe('expirada');
    expect(detail.body.finalReason).toBe('plazo_pago');
    expect(detail.body.allowedActions).toEqual([]);
    const stored = await harness.pool.query('SELECT status FROM join_requests WHERE id = $1', [id]);
    expect(stored.rows[0]).toEqual({ status: 'esperando_pago' });
  });

  it('RNF-010-01: sin cupo el titular no puede enviar datos de pago', async () => {
    const full = await harness.createGroup({ members: 4 });
    const person = await harness.insertUser();
    const id = await seedRequest(harness, full, person, 'abierta');

    const detail = await get(full.ownerId, `/join-requests/${id}`).expect(200);

    expect(detail.body.allowedActions).toEqual(['reject', 'sendMessage']);
  });
});
