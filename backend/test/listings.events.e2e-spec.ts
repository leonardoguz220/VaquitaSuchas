import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { DomainEvent } from '../src/shared/events/domain-event.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { seedListing } from './support/listings-fixtures.js';
import { setClock } from './support/join-requests-fixtures.js';

// Manejadores de eventos de grupos y cuentas sobre la publicación (spec 008 US5, T024/T025).
describe('Eventos que afectan a las publicaciones', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const publish = (event: DomainEvent): Promise<void> =>
    harness.app
      .get(DbService, { strict: false })
      .withTransaction((tx) => harness.app.get(TxEventBus, { strict: false }).publish(tx, event));
  const row = async (listingId: string) =>
    (
      await harness.pool.query<{
        status: string;
        slots_offered: number;
        end_reason: string | null;
      }>('SELECT status, slots_offered, end_reason FROM listings WHERE id = $1', [listingId])
    ).rows[0];
  const addMember = async (groupId: string): Promise<string> => {
    const userId = await harness.insertUser();
    await harness.pool.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source) VALUES ($1, $2, 'miembro', 'creacion')`,
      [groupId, userId],
    );
    return userId;
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => setClock(harness, NOW));

  it('RN-008-04: MemberAdded ajusta los cupos ofrecidos a los libres', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1, totalSlots: 5, offered: 3 });
    const userId = await addMember(seeded.groupId);
    await addMember(seeded.groupId);

    await publish({ type: 'groups.member-added', groupId: seeded.groupId, userId } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({ status: 'activa', slots_offered: 1 });
  });

  it('RN-008-04: MemberAdded que llena el grupo cierra la publicación por grupo_lleno', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1, totalSlots: 3, offered: 1 });
    const userId = await addMember(seeded.groupId);

    await publish({ type: 'groups.member-added', groupId: seeded.groupId, userId } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({
      status: 'cerrada',
      slots_offered: 0,
      end_reason: 'grupo_lleno',
    });
  });

  it('RN-008-04: MemberRemoved no sube los cupos ofrecidos ni cambia una publicación al día', async () => {
    const seeded = await seedListing(harness, { extraMembers: 2, totalSlots: 5, offered: 2 });
    await harness.pool.query(
      `UPDATE group_members SET left_at = now(), left_reason = 'abandono' WHERE group_id = $1 AND user_id = $2`,
      [seeded.groupId, seeded.memberIds[0]],
    );

    await publish({
      type: 'groups.member-removed',
      groupId: seeded.groupId,
      userId: seeded.memberIds[0],
      reason: 'abandono',
    } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({ status: 'activa', slots_offered: 2 });
  });

  it('CA-008-16: GroupClosed cierra la publicación por grupo_cerrado; repetir el evento no cambia nada', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [seeded.groupId],
    );

    await publish({ type: 'groups.closed', groupId: seeded.groupId } as DomainEvent);
    await publish({ type: 'groups.closed', groupId: seeded.groupId } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({
      status: 'cerrada',
      end_reason: 'grupo_cerrado',
    });
  });

  it('RF-008-05: GroupFrozen cierra la publicación por grupo_congelado, también si estaba oculta', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1, status: 'oculta' });
    await harness.pool.query(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
      [seeded.groupId],
    );

    await publish({ type: 'groups.frozen', groupId: seeded.groupId } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({
      status: 'cerrada',
      end_reason: 'grupo_congelado',
    });
  });

  it('RN-008-04: UserBanned del titular cierra sus publicaciones por grupo_congelado', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    await harness.pool.query(`UPDATE users SET status = 'baneado' WHERE id = $1`, [seeded.ownerId]);

    await publish({ type: 'users.banned', userId: seeded.ownerId } as DomainEvent);

    expect(await row(seeded.listingId)).toMatchObject({
      status: 'cerrada',
      end_reason: 'grupo_congelado',
    });
  });

  it('RN-008-04: UserSuspended no cambia la publicación', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [
      seeded.ownerId,
    ]);

    await publish({ type: 'users.suspended', userId: seeded.ownerId } as DomainEvent);

    expect((await row(seeded.listingId))?.status).toBe('activa');
  });

  it('RF-008-05: OwnerChanged deja la publicación y avisa publicacion_transferida al nuevo titular', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    const newOwnerId = seeded.memberIds[0] as string;

    await publish({
      type: 'groups.owner-changed',
      groupId: seeded.groupId,
      previousOwnerId: seeded.ownerId,
      newOwnerId,
    } as DomainEvent);

    expect((await row(seeded.listingId))?.status).toBe('activa');
    const notices = await harness.pool.query<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE type = 'publicacion_transferida'`,
    );
    expect(notices.rows).toEqual([{ user_id: newOwnerId }]);
  });
});
