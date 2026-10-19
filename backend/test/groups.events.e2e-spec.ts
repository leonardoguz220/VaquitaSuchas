import { DbService } from '../src/shared/db/db.service.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import type { DomainEvent } from '../src/shared/events/domain-event.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Manejadores de eventos de cuenta del módulo subscriptions (spec 001 T028) contra PostgreSQL real.
describe('Eventos de cuenta sobre grupos', () => {
  const harness = new BillingHarness({
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({ check: () => Promise.resolve({ eligible: true, source: 'manual' }) }),
  });
  let db: DbService;
  let bus: TxEventBus;

  const publish = (event: DomainEvent): Promise<void> =>
    db.withTransaction((tx) => bus.publish(tx, event));
  const banned = (userId: string): Promise<void> =>
    publish({ type: 'users.banned', userId } as DomainEvent);
  const unbanned = (userId: string): Promise<void> =>
    publish({ type: 'users.unbanned', userId } as DomainEvent);
  const groupRow = async (groupId: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM groups WHERE id = $1', [groupId])).rows[0];
  const memberRow = async (groupId: string, userId: string): Promise<Record<string, unknown>> =>
    (
      await harness.pool.query(
        'SELECT role, left_at, left_reason FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, userId],
      )
    ).rows[0];

  beforeAll(async () => {
    await harness.start();
    db = harness.app.get(DbService, { strict: false });
    bus = harness.app.get(TxEventBus, { strict: false });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  it('RF-001-23 y RN-001-07: UserBanned congela los grupos del titular y no lo saca de ellos', async () => {
    const group: TestGroup = await harness.createGroup({ members: 2 });
    const [memberId] = group.memberIds as [string, string];

    await banned(group.ownerId);

    const row = await groupRow(group.id);
    expect(row.frozen_at).toBeInstanceOf(Date);
    expect(row.frozen_reason).toBe('titular_baneado');
    expect((await memberRow(group.id, group.ownerId)).left_at).toBeNull();
    expect((await memberRow(group.id, group.ownerId)).role).toBe('titular');
    expect((await memberRow(group.id, memberId)).left_at).toBeNull();
  });

  it('RF-001-23: UserBanned congela también un grupo cerrado del titular', async () => {
    const group = await harness.createGroup({ members: 1 });
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [group.id],
    );

    await banned(group.ownerId);

    expect((await groupRow(group.id)).frozen_reason).toBe('titular_baneado');
  });

  it('RF-001-23: UserBanned retira al usuario con reason baneo de los grupos donde es miembro', async () => {
    const group = await harness.createGroup({ members: 2 });
    const [target, other] = group.memberIds as [string, string];

    await banned(target);

    const row = await memberRow(group.id, target);
    expect(row.left_at).toBeInstanceOf(Date);
    expect(row.left_reason).toBe('baneo');
    expect((await memberRow(group.id, other)).left_at).toBeNull();
    expect((await groupRow(group.id)).frozen_at).toBeNull();
  });

  it('RF-001-23: UserBanned es idempotente (repetirlo no cambia nada ni falla)', async () => {
    const group = await harness.createGroup({ members: 1 });
    await banned(group.ownerId);
    const first = (await groupRow(group.id)).frozen_at;

    await banned(group.ownerId);

    expect((await groupRow(group.id)).frozen_at).toEqual(first);
  });

  it('RN-001-07: UserSuspended no toca el grupo ni las pertenencias', async () => {
    const group = await harness.createGroup({ members: 1 });
    const [memberId] = group.memberIds as [string];

    await publish({ type: 'users.suspended', userId: group.ownerId } as DomainEvent);
    await publish({ type: 'users.suspended', userId: memberId } as DomainEvent);

    expect((await groupRow(group.id)).frozen_at).toBeNull();
    expect((await memberRow(group.id, memberId)).left_at).toBeNull();
  });

  it('CA-009-37: UserUnbanned descongela solo los grupos que ese baneo congeló', async () => {
    const mine = await harness.createGroup({ members: 1 });
    const foreign = await harness.createGroup({ members: 1 });
    await banned(mine.ownerId);
    await harness.pool.query(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
      [foreign.id],
    );

    await unbanned(mine.ownerId);

    const row = await groupRow(mine.id);
    expect(row.frozen_at).toBeNull();
    expect(row.frozen_reason).toBeNull();
    expect((await groupRow(foreign.id)).frozen_reason).toBe('titular_baneado');
    expect((await memberRow(mine.id, mine.ownerId)).left_at).toBeNull();
  });

  it('CA-009-37: UserUnbanned no restituye pertenencias de otros grupos y es idempotente', async () => {
    const group = await harness.createGroup({ members: 1 });
    const [target] = group.memberIds as [string];
    await banned(target);

    await unbanned(target);
    await unbanned(target);

    expect((await memberRow(group.id, target)).left_reason).toBe('baneo');
  });
});
