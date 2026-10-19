import request from 'supertest';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { inviteCodeOf, setClock } from './support/join-requests-fixtures.js';

// Código de invitación (spec 001 T022/T023): regenerar y límite de intentos fallidos.
describe('Código de invitación', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const auth = (userId: string): [string, string] => [
    'Authorization',
    `Bearer ${harness.token(userId)}`,
  ];
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const useCode = (userId: string, code: string): request.Test =>
    http()
      .post('/join-requests')
      .set(...auth(userId))
      .send({ code });
  const regenerate = (userId: string, groupId: string): request.Test =>
    http()
      .post(`/groups/${groupId}/invite-code/regenerate`)
      .set(...auth(userId));

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => {
    setClock(harness, NOW);
  });

  it('CA-001-09: el código regenerado deja de funcionar y el nuevo sí', async () => {
    const group = await harness.createGroup({ members: 1 });
    const oldCode = await inviteCodeOf(harness, group.id);
    const applicant = await harness.insertUser();

    const response = await regenerate(group.ownerId, group.id).expect(200);

    expect(response.body.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(response.body.inviteCode).not.toBe(oldCode);
    expect(await inviteCodeOf(harness, group.id)).toBe(response.body.inviteCode);
    const rejected = await useCode(applicant, oldCode).expect(422);
    expect(rejected.body).toMatchObject({
      code: 'INVALID_INVITE_CODE',
      message: 'Código inválido.',
    });
    await useCode(applicant, response.body.inviteCode).expect(201);
  });

  it('CA-001-09: el titular ve el código nuevo en el detalle y la versión sube', async () => {
    const group = await harness.createGroup({ members: 1 });
    const before = await http()
      .get(`/groups/${group.id}`)
      .set(...auth(group.ownerId))
      .expect(200);

    const response = await regenerate(group.ownerId, group.id).expect(200);

    const after = await http()
      .get(`/groups/${group.id}`)
      .set(...auth(group.ownerId))
      .expect(200);
    expect(after.body.inviteCode).toBe(response.body.inviteCode);
    expect(after.body.version).toBe(before.body.version + 1);
  });

  it('CA-001-09: el error es idéntico para un código inexistente, regenerado o de grupo cerrado', async () => {
    const group = await harness.createGroup({ members: 1 });
    const closed = await harness.createGroup({ members: 1 });
    const closedCode = await inviteCodeOf(harness, closed.id);
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1",
      [closed.id],
    );
    const oldCode = await inviteCodeOf(harness, group.id);
    await regenerate(group.ownerId, group.id).expect(200);
    const applicant = await harness.insertUser();

    const bodies = [];
    for (const code of ['ZZZZZZZZ', oldCode, closedCode]) {
      bodies.push((await useCode(applicant, code).expect(422)).body);
    }

    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(bodies[0]).toMatchObject({ code: 'INVALID_INVITE_CODE', message: 'Código inválido.' });
  });

  it('CA-001-18: 10 fallos en 15 minutos bloquean al usuario y pasado el plazo vuelve a funcionar', async () => {
    const group = await harness.createGroup({ members: 1 });
    const code = await inviteCodeOf(harness, group.id);
    const user = await harness.insertUser();
    const other = await harness.insertUser();
    for (let i = 0; i < 10; i++) await useCode(user, 'ZZZZZZZZ').expect(422);

    const blocked = await useCode(user, code).expect(429);

    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.details.retryAfterSeconds).toBeGreaterThan(0);
    // El límite es por usuario: otra persona no se ve afectada.
    await useCode(other, code).expect(201);
    harness.clock.advance(15 * 60_000 + 1000);
    await useCode(user, code).expect(201);
  });

  it('CA-001-18: 9 fallos todavía no bloquean', async () => {
    const group = await harness.createGroup({ members: 1 });
    const code = await inviteCodeOf(harness, group.id);
    const user = await harness.insertUser();
    for (let i = 0; i < 9; i++) await useCode(user, 'ZZZZZZZZ').expect(422);

    await useCode(user, code).expect(201);
  });

  it('RF-001-08: solo el titular regenera; un miembro recibe 403 y un ajeno 404', async () => {
    const group = await harness.createGroup({ members: 1 });
    const code = await inviteCodeOf(harness, group.id);
    const outsider = await harness.insertUser();

    await regenerate(group.memberIds[0] as string, group.id).expect(403);
    await regenerate(outsider, group.id).expect(404);
    await http().post(`/groups/${group.id}/invite-code/regenerate`).expect(401);

    expect(await inviteCodeOf(harness, group.id)).toBe(code);
  });

  it('RF-001-08: un grupo cerrado o congelado no regenera el código', async () => {
    const closed = await harness.createGroup({ members: 1 });
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1",
      [closed.id],
    );
    const frozen = await harness.createGroup({ members: 1 });
    await harness.freezeGroup(frozen.id);

    const a = await regenerate(closed.ownerId, closed.id).expect(422);
    const b = await regenerate(frozen.ownerId, frozen.id).expect(422);

    expect(a.body.code).toBe('GROUP_CLOSED');
    expect(b.body.code).toBe('GROUP_FROZEN');
  });
});
