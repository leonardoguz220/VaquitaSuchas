import request from 'supertest';
import { NoOwnershipBlockersAdapter } from '../src/app-adapters/ownership-blockers.adapter.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { OWNERSHIP_BLOCKERS_PORT } from '../src/modules/subscriptions/ports/ownership-blockers.port.js';
import type { OwnerChanged } from '../src/shared/events/group-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { insertOwnedGroup } from './support/groups-fixtures.js';

// Transferencia de titularidad (spec 001 T035/T036) contra PostgreSQL real. El puerto de
// elegibilidad y el de bloqueos (spec 010, aún inexistente) son dobles de prueba.
describe('Transferir la titularidad', () => {
  const ineligible = new Set<string>();
  const blockedGroups = new Set<string>();
  const harness = new BillingHarness({
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({
          check: (_q: unknown, userId: string) =>
            Promise.resolve({ eligible: !ineligible.has(userId), source: 'manual' }),
        })
        .overrideProvider(OWNERSHIP_BLOCKERS_PORT)
        .useValue({
          blockers: (_q: unknown, groupId: string) =>
            Promise.resolve(blockedGroups.has(groupId) ? ['join_requests_in_payment'] : []),
        }),
  });
  const events: OwnerChanged[] = [];

  const transfer = (userId: string, groupId: string, toUserId: unknown): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/groups/${groupId}/transfer-ownership`)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send({ toUserId });

  const activeTitulars = async (groupId: string): Promise<string[]> =>
    (
      await harness.pool.query<{ user_id: string }>(
        `SELECT user_id FROM group_members
          WHERE group_id = $1 AND left_at IS NULL AND role = 'titular'`,
        [groupId],
      )
    ).rows.map((row) => row.user_id);

  const ownerOf = async (groupId: string): Promise<string> =>
    (await harness.pool.query('SELECT owner_id FROM groups WHERE id = $1', [groupId])).rows[0]
      .owner_id;

  const newGroup = (): Promise<TestGroup> => harness.createGroup({ members: 2 });

  beforeAll(async () => {
    await harness.start();
    harness.app
      .get(TxEventBus, { strict: false })
      .register<OwnerChanged>('groups.owner-changed', (_tx, event) => {
        events.push(event);
      });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => {
    events.length = 0;
    ineligible.clear();
    blockedGroups.clear();
  });

  it('CA-001-13 y RF-001-17: transfiere en una transacción y queda un único titular', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;

    const response = await transfer(group.ownerId, group.id, target).expect(200);

    expect(await activeTitulars(group.id)).toEqual([target]);
    expect(await ownerOf(group.id)).toBe(target);
    expect(response.body).toMatchObject({ id: group.id, myRole: 'miembro' });
    expect(response.body.inviteCode).toBeUndefined();
    const roles = await harness.pool.query(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.id, group.ownerId],
    );
    expect(roles.rows).toEqual([{ role: 'miembro' }]);
    expect(events).toEqual([
      {
        type: 'groups.owner-changed',
        groupId: group.id,
        previousOwnerId: group.ownerId,
        newOwnerId: target,
      },
    ]);
  });

  it('CA-001-13: el nuevo titular puede editar y el anterior ya no (403)', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;
    await transfer(group.ownerId, group.id, target).expect(200);
    const rename = (userId: string): request.Test =>
      request(harness.app.getHttpServer())
        .patch(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${harness.token(userId)}`)
        .send({ name: 'Nuevo nombre' });

    await rename(target).expect(200);
    await rename(group.ownerId).expect(403);
  });

  it('CA-001-30: transferir a quien no está habilitado como titular se rechaza y no cambia nada', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;
    ineligible.add(target);

    const response = await transfer(group.ownerId, group.id, target).expect(422);

    expect(response.body).toMatchObject({
      code: 'NOT_HOST_ELIGIBLE',
      details: { rule: 'RF-001-21' },
    });
    expect(await ownerOf(group.id)).toBe(group.ownerId);
    expect(await activeTitulars(group.id)).toEqual([group.ownerId]);
    expect(events).toEqual([]);
  });

  it('RN-001-14: el destinatario con 5 grupos activos como titular no puede recibir otro', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;
    for (let i = 0; i < 5; i++) await insertOwnedGroup(harness, target);

    const response = await transfer(group.ownerId, group.id, target).expect(422);

    expect(response.body).toMatchObject({
      code: 'TOO_MANY_ACTIVE_GROUPS',
      details: { rule: 'RN-001-14' },
    });
    expect(await ownerOf(group.id)).toBe(group.ownerId);
  });

  it('RN-001-14: con 4 grupos activos el destinatario aún puede recibir uno más', async () => {
    const group = await newGroup();
    const target = group.memberIds[0] as string;
    for (let i = 0; i < 4; i++) await insertOwnedGroup(harness, target);

    await transfer(group.ownerId, group.id, target).expect(200);

    expect(await ownerOf(group.id)).toBe(target);
  });

  it('RF-001-17: el destinatario debe ser miembro activo del grupo', async () => {
    const group = await newGroup();
    const stranger = await harness.insertUser();
    const left = group.memberIds[1] as string;
    await harness.leaveGroup(group.id, left);

    for (const toUserId of [stranger, left, group.ownerId]) {
      const response = await transfer(group.ownerId, group.id, toUserId).expect(422);
      expect(response.body).toMatchObject({
        code: 'BUSINESS_RULE',
        details: { rule: 'RF-001-17' },
      });
    }
    expect(await ownerOf(group.id)).toBe(group.ownerId);
  });

  it('RN-010-09 y CA-001-13: con solicitudes en pago (OwnershipBlockersPort) no se transfiere', async () => {
    const group = await newGroup();
    blockedGroups.add(group.id);

    const response = await transfer(group.ownerId, group.id, group.memberIds[0]).expect(422);

    expect(response.body).toMatchObject({
      code: 'BUSINESS_RULE',
      details: { rule: 'RN-010-09', blockers: ['join_requests_in_payment'] },
    });
    expect(await ownerOf(group.id)).toBe(group.ownerId);
  });

  it('CA-001-11, CA-001-10 y VALIDATION_ERROR: miembro 403, ajeno 404, sin sesión 401, id inválido 400', async () => {
    const group = await newGroup();
    const stranger = await harness.insertUser();
    const member = group.memberIds[0] as string;

    await transfer(member, group.id, group.memberIds[1]).expect(403);
    await transfer(stranger, group.id, member).expect(404);
    await request(harness.app.getHttpServer())
      .post(`/groups/${group.id}/transfer-ownership`)
      .send({ toUserId: member })
      .expect(401);
    await transfer(group.ownerId, group.id, 'no-es-uuid').expect(400);
    expect(await ownerOf(group.id)).toBe(group.ownerId);
  });

  it('RN-001-07: un grupo cerrado o congelado no transfiere', async () => {
    const closed = await newGroup();
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [closed.id],
    );
    const frozen = await newGroup();
    await harness.freezeGroup(frozen.id);

    expect(
      (await transfer(closed.ownerId, closed.id, closed.memberIds[0]).expect(422)).body.code,
    ).toBe('GROUP_CLOSED');
    expect(
      (await transfer(frozen.ownerId, frozen.id, frozen.memberIds[0]).expect(422)).body.code,
    ).toBe('GROUP_FROZEN');
  });

  it('RN-010-09: el adaptador por defecto de OwnershipBlockersPort no informa bloqueos (spec 010 pendiente)', async () => {
    await expect(new NoOwnershipBlockersAdapter().blockers(harness.pool, 'g')).resolves.toEqual([]);
  });
});
