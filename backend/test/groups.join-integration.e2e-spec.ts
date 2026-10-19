import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { inviteCodeOf, seedRequest, setClock } from './support/join-requests-fixtures.js';

// Integración spec 001 ↔ spec 010 (T024): el código de invitación abre solicitudes. El detalle de
// cada flujo vive en join-requests.open / join-requests.concurrency; aquí queda la trazabilidad de
// los CA de la spec 001 con sus propios identificadores.
describe('Código de invitación y solicitudes de ingreso (spec 001 con spec 010)', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const post = (userId: string, code: string): request.Test =>
    http()
      .post('/join-requests')
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send({ code });
  const members = async (groupId: string): Promise<number> =>
    Number(
      (
        await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
          [groupId],
        )
      ).rows[0]?.n,
    );

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => {
    setClock(harness, NOW);
  });

  it('CA-001-06: un código válido abre una solicitud con cuota estimada y no hace miembro', async () => {
    const group = await harness.createGroup({ members: 2 });
    const applicant = await harness.insertUser();

    const response = await post(applicant, await inviteCodeOf(harness, group.id)).expect(201);

    expect(response.body.phase.status).toBe('abierta');
    expect(response.body.estimatedShareCents).toBe(2500);
    expect(await members(group.id)).toBe(3);
    const isMember = await harness.pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, applicant],
    );
    expect(isMember.rowCount).toBe(0);
  });

  it('CA-001-08: quien ya es miembro es rechazado sin duplicarlo', async () => {
    const group = await harness.createGroup({ members: 2 });
    const member = group.memberIds[0] as string;

    const response = await post(member, await inviteCodeOf(harness, group.id)).expect(422);

    expect(response.body.code).toBe('ALREADY_MEMBER');
    expect(await members(group.id)).toBe(3);
  });

  it('CA-001-19: dos solicitudes por el último cupo, exactamente una llega a esperar el pago', async () => {
    const group = await harness.createGroup({ members: 3 }); // 4 de 5 cupos
    const ids = [
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
    ];

    const results = await Promise.all(
      ids.map((id) =>
        http()
          .post(`/join-requests/${id}/payment-data`)
          .set('Authorization', `Bearer ${harness.token(group.ownerId)}`),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    const states = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_requests WHERE id = ANY($1::uuid[]) ORDER BY status',
      [ids],
    );
    expect(states.rows.map((r) => r.status)).toEqual(['abierta', 'esperando_pago']);
  });

  it('CA-001-26: el último minuto de la ventana abre la solicitud y el siguiente la rechaza con la próxima apertura', async () => {
    const group = await harness.createGroup({ members: 2 });
    const code = await inviteCodeOf(harness, group.id);
    const early = await harness.insertUser();
    const late = await harness.insertUser();

    setClock(harness, '2026-10-19T03:59:00.000Z'); // 18 oct 23:59 en La Paz
    await post(early, code).expect(201);

    setClock(harness, '2026-10-19T04:00:00.000Z'); // 19 oct 00:00 en La Paz
    const response = await post(late, code).expect(422);

    expect(response.body.code).toBe('ENTRY_WINDOW_CLOSED');
    expect(response.body.details.opensAt).toBe('2026-11-15T04:00:00.000Z');
  });
});
