import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { pngBytes } from './support/receipt-files.js';

// Permisos sobre un grupo (spec 001 T018): 404 para quien no pertenece, 403 para un miembro
// sin rol de titular.
describe('Permisos del grupo', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let stranger: string;
  let member: string;

  const call = (
    method: 'get' | 'patch' | 'put' | 'post' | 'delete',
    userId: string,
    path: string,
  ): request.Test =>
    request(harness.app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    member = group.memberIds[0] as string;
    stranger = await harness.insertUser();
  });

  it('CA-001-10 y RNF-001-01: quien no es miembro recibe 404 al consultar el detalle, igual que un grupo inexistente', async () => {
    const real = await call('get', stranger, `/groups/${group.id}`).expect(404);
    const missing = await call(
      'get',
      stranger,
      '/groups/00000000-0000-4000-8000-000000000000',
    ).expect(404);
    expect(real.body).toEqual(missing.body);
    await call('get', stranger, '/groups/no-es-un-uuid').expect(404);
    await request(harness.app.getHttpServer()).get(`/groups/${group.id}`).expect(401);
  });

  it('CA-001-10: quien no es miembro recibe 404 en las demás rutas del grupo', async () => {
    await call('patch', stranger, `/groups/${group.id}`).send({ name: 'x' }).expect(404);
    await call('put', stranger, `/groups/${group.id}/payment-info`).field('text', 'x').expect(404);
    await call('delete', stranger, `/groups/${group.id}/members/${member}`).expect(404);
    await call('post', stranger, `/groups/${group.id}/close`).expect(404);
    await call('post', stranger, `/groups/${group.id}/leave`).expect(404);
  });

  it('CA-001-10: un exmiembro tampoco ve el grupo', async () => {
    await harness.leaveGroup(group.id, member);
    await call('get', member, `/groups/${group.id}`).expect(404);
  });

  it('CA-001-11: un miembro que no es titular no edita, no quita y no cambia datos de pago (403)', async () => {
    const other = group.memberIds[1] as string;
    await call('patch', member, `/groups/${group.id}`).send({ name: 'nuevo' }).expect(403);
    await call('delete', member, `/groups/${group.id}/members/${other}`).expect(403);
    await call('put', member, `/groups/${group.id}/payment-info`)
      .field('text', 'x')
      .attach('qr', pngBytes(), { filename: 'qr.png' })
      .expect(403);
    await call('post', member, `/groups/${group.id}/close`).expect(403);

    const stored = await harness.pool.query<{ name: string }>(
      'SELECT name FROM groups WHERE id = $1',
      [group.id],
    );
    expect(stored.rows[0]?.name).toBe('Grupo');
    const members = await harness.pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [group.id],
    );
    expect(members.rowCount).toBe(3);
  });

  it('CA-001-11: el miembro sí puede consultar el detalle', async () => {
    await call('get', member, `/groups/${group.id}`).expect(200);
  });
});
