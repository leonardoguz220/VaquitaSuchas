import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';

// Permisos de grupo (spec 001 T018): 404 a quien no es miembro, 403 al miembro que no es titular.
describe('Permisos de grupo', () => {
  const harness = new BillingHarness();
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const auth = (userId: string): [string, string] => [
    'Authorization',
    `Bearer ${harness.token(userId)}`,
  ];

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-001-10: quien no es miembro recibe 404 en el detalle, igual que un grupo inexistente', async () => {
    const group = await harness.createGroup({ members: 1 });
    const outsider = await harness.insertUser();

    const foreign = await http()
      .get(`/groups/${group.id}`)
      .set(...auth(outsider))
      .expect(404);
    const missing = await http()
      .get('/groups/00000000-0000-4000-8000-000000000000')
      .set(...auth(outsider))
      .expect(404);

    expect(foreign.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(foreign.body.message).toBe(missing.body.message);
  });

  it('CA-001-10: un exmiembro y un id mal formado reciben 404, y sin sesión 401', async () => {
    const group = await harness.createGroup({ members: 1 });
    const gone = group.memberIds[0] as string;
    await harness.leaveGroup(group.id, gone);

    await http()
      .get(`/groups/${group.id}`)
      .set(...auth(gone))
      .expect(404);
    await http()
      .get('/groups/no-es-uuid')
      .set(...auth(group.ownerId))
      .expect(404);
    await http().get(`/groups/${group.id}`).expect(401);
  });

  it('CA-001-11: un miembro que intenta editar o quitar a otro recibe 403 y nada cambia', async () => {
    const group = await harness.createGroup({ members: 2 });
    const [member, other] = group.memberIds as [string, string];

    await http()
      .patch(`/groups/${group.id}`)
      .set(...auth(member))
      .send({ name: 'Otro nombre' })
      .expect(403);
    await http()
      .delete(`/groups/${group.id}/members/${other}`)
      .set(...auth(member))
      .expect(403);

    const name = await harness.pool.query('SELECT name FROM groups WHERE id = $1', [group.id]);
    expect(name.rows[0]).toEqual({ name: 'Grupo' });
    const active = await harness.pool.query(
      'SELECT count(*) AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [group.id],
    );
    expect(Number(active.rows[0].n)).toBe(3);
  });

  it('CA-001-11: un ajeno que intenta editar o quitar recibe 404, no 403', async () => {
    const group = await harness.createGroup({ members: 1 });
    const outsider = await harness.insertUser();

    await http()
      .patch(`/groups/${group.id}`)
      .set(...auth(outsider))
      .send({ name: 'Otro' })
      .expect(404);
    await http()
      .delete(`/groups/${group.id}/members/${group.memberIds[0]}`)
      .set(...auth(outsider))
      .expect(404);
  });
});
