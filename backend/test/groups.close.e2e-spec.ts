import request from 'supertest';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { OWNERSHIP_BLOCKERS_PORT } from '../src/modules/subscriptions/ports/ownership-blockers.port.js';
import { MembershipService } from '../src/modules/subscriptions/services/membership.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { GroupClosed } from '../src/shared/events/group-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';

// Cierre del grupo (spec 001 T035/T036) contra PostgreSQL real. El puerto de bloqueos es un doble.
describe('Cerrar grupos', () => {
  const blockedGroups = new Set<string>();
  const harness = new BillingHarness({
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({ check: () => Promise.resolve({ eligible: true, source: 'manual' }) })
        .overrideProvider(OWNERSHIP_BLOCKERS_PORT)
        .useValue({
          blockers: (_q: unknown, groupId: string) =>
            Promise.resolve(blockedGroups.has(groupId) ? ['join_requests_in_payment'] : []),
        }),
  });
  const events: GroupClosed[] = [];

  const asUser = (userId: string, method: 'post' | 'patch', url: string): request.Test =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const close = (userId: string, groupId: string): request.Test =>
    asUser(userId, 'post', `/groups/${groupId}/close`);

  const newGroup = (): Promise<TestGroup> => harness.createGroup({ members: 2 });
  const groupRow = async (groupId: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM groups WHERE id = $1', [groupId])).rows[0];
  const activeCount = async (groupId: string): Promise<number> =>
    Number(
      (
        await harness.pool.query(
          'SELECT count(*) AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
          [groupId],
        )
      ).rows[0].n,
    );

  beforeAll(async () => {
    await harness.start();
    harness.app
      .get(TxEventBus, { strict: false })
      .register<GroupClosed>('groups.closed', (_tx, event) => {
        events.push(event);
      });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => {
    events.length = 0;
    blockedGroups.clear();
  });

  it('RF-001-18: el titular cierra el grupo, recibe status cerrado y se publica GroupClosed', async () => {
    const group = await newGroup();

    const response = await close(group.ownerId, group.id).expect(200);

    expect(response.body).toMatchObject({ id: group.id, status: 'cerrado', myRole: 'titular' });
    const stored = await groupRow(group.id);
    expect(stored['status']).toBe('cerrado');
    expect((stored['closed_at'] as Date).toISOString()).toBe(NOW);
    expect(events).toEqual([{ type: 'groups.closed', groupId: group.id }]);
  });

  it('CA-001-16 y RN-001-07: un grupo cerrado rechaza unirse y editar, y sus miembros siguen activos en solo lectura', async () => {
    const group = await newGroup();
    await close(group.ownerId, group.id).expect(200);
    const membership = harness.app.get(MembershipService, { strict: false });
    const db = harness.app.get(DbService, { strict: false });
    const newcomer = await harness.insertUser();

    const join = db.withTransaction((tx) =>
      membership.addMemberTx(tx, group.id, newcomer, 'creacion', null),
    );
    await expect(join).rejects.toMatchObject({ code: 'GROUP_CLOSED' });
    const edit = await asUser(group.ownerId, 'patch', `/groups/${group.id}`)
      .send({ name: 'Otro nombre' })
      .expect(422);
    expect(edit.body.code).toBe('GROUP_CLOSED');
    expect(await activeCount(group.id)).toBe(3);
    const member = group.memberIds[0] as string;
    const view = await harness.pool.query(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.id, member],
    );
    expect(view.rows).toEqual([{ role: 'miembro' }]);
  });

  it('RN-001-07: un grupo cerrado no genera más cobros', async () => {
    const group = await newGroup();
    await close(group.ownerId, group.id).expect(200);
    const cycles = harness.app.get(BillingCyclesService, { strict: false });
    const db = harness.app.get(DbService, { strict: false });

    const generated = await db.withTransaction((tx) =>
      cycles.ensureCurrentCycle(tx, group.id, new Date('2026-11-16T15:00:00.000Z')),
    );

    expect(generated).toBeNull();
  });

  it('RN-001-07: cerrar dos veces responde GROUP_CLOSED y un congelado tampoco cierra', async () => {
    const group = await newGroup();
    await close(group.ownerId, group.id).expect(200);
    const frozen = await newGroup();
    await harness.freezeGroup(frozen.id);

    expect((await close(group.ownerId, group.id).expect(422)).body.code).toBe('GROUP_CLOSED');
    expect((await close(frozen.ownerId, frozen.id).expect(422)).body.code).toBe('GROUP_FROZEN');
    expect(events).toHaveLength(1);
  });

  it('RN-010-09: con solicitudes en pago (OwnershipBlockersPort) no se cierra', async () => {
    const group = await newGroup();
    blockedGroups.add(group.id);

    const response = await close(group.ownerId, group.id).expect(422);

    expect(response.body).toMatchObject({
      code: 'BUSINESS_RULE',
      details: { rule: 'RN-010-09' },
    });
    expect((await groupRow(group.id))['status']).toBe('activo');
    expect(events).toEqual([]);
  });

  it('RN-001-14: un grupo cerrado deja de contar para el tope de 5 del titular', async () => {
    const group = await newGroup();
    const before = await harness.pool.query(
      `SELECT count(*) AS n FROM groups WHERE owner_id = $1 AND status = 'activo'`,
      [group.ownerId],
    );
    await close(group.ownerId, group.id).expect(200);
    const after = await harness.pool.query(
      `SELECT count(*) AS n FROM groups WHERE owner_id = $1 AND status = 'activo'`,
      [group.ownerId],
    );

    expect(Number(before.rows[0].n)).toBe(1);
    expect(Number(after.rows[0].n)).toBe(0);
  });

  it('CA-001-11, CA-001-10: un miembro recibe 403, un ajeno 404 y sin sesión 401', async () => {
    const group = await newGroup();
    const stranger = await harness.insertUser();

    await close(group.memberIds[0] as string, group.id).expect(403);
    await close(stranger, group.id).expect(404);
    await request(harness.app.getHttpServer()).post(`/groups/${group.id}/close`).expect(401);
    expect((await groupRow(group.id))['status']).toBe('activo');
  });
});
