import type {
  GroupClosed,
  GroupFrozen,
  MemberAdded,
  MemberRemoved,
  OwnerChanged,
} from '../src/shared/events/group-events.js';
import type { UserSuspended } from '../src/shared/events/user-events.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';
import {
  insertGroup,
  notificationsOf,
  publish,
  setName,
} from './support/notifications-fixtures.js';

// Spec 005 (T009): avisos de grupos y membresías. Requiere PostgreSQL.
describe('Notificaciones de grupos (spec 005)', () => {
  let t: AuthTestApp;
  let owner: TestUser;
  let ana: TestUser;
  let beto: TestUser;
  let groupId: string;

  beforeAll(async () => {
    t = await startAuthApp();
    owner = await t.createUser();
    ana = await t.createUser();
    beto = await t.createUser();
    await setName(t, owner.id, 'Hilda Titular');
    await setName(t, ana.id, 'Ana Miembro');
    groupId = await insertGroup(t, owner.id, [ana.id, beto.id]);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
  });

  const types = async (u: TestUser) => (await notificationsOf(t, u.id)).map((n) => n.type);

  it('RF-005-09: un miembro nuevo avisa al titular con su nombre', async () => {
    const event: MemberAdded = { type: 'groups.member-added', groupId, userId: ana.id };
    await publish(t, event);
    const [n] = await notificationsOf(t, owner.id);
    expect(n).toMatchObject({ type: 'miembro_se_une', category: 'titular' });
    expect(n!.body).toContain('Ana Miembro');
    expect(await types(ana)).toEqual([]);
  });

  it('RF-005-09: abandono avisa al titular; quitado y baneo avisan a la persona retirada', async () => {
    const left: MemberRemoved = {
      type: 'groups.member-removed',
      groupId,
      userId: ana.id,
      reason: 'abandono',
    };
    const kicked: MemberRemoved = { ...left, userId: beto.id, reason: 'quitado' };
    const mora: MemberRemoved = { ...left, userId: beto.id, reason: 'mora' };
    await publish(t, left, kicked, mora);
    expect(await types(owner)).toEqual(['miembro_abandona']);
    expect(await types(beto)).toEqual(['miembro_quitado']);
  });

  it('RF-005-09: cambio de titular y cierre avisan a los miembros', async () => {
    const changed: OwnerChanged = {
      type: 'groups.owner-changed',
      groupId,
      previousOwnerId: owner.id,
      newOwnerId: ana.id,
    };
    const closed: GroupClosed = { type: 'groups.closed', groupId };
    await publish(t, changed, closed);
    expect(await types(beto)).toEqual(['titularidad_cambiada', 'grupo_cerrado']);
    expect(await types(owner)).toEqual(['titularidad_cambiada']);
    expect(await types(ana)).toEqual(['grupo_cerrado']);
  });

  it('RF-005-12: titular suspendido y grupo congelado avisan a los miembros, no al titular', async () => {
    const suspended: UserSuspended = { type: 'users.suspended', userId: owner.id };
    const frozen: GroupFrozen = { type: 'groups.frozen', groupId };
    await publish(t, suspended, frozen);
    expect(await types(ana)).toEqual(['titular_suspendido', 'titular_baneado']);
    expect(await types(beto)).toEqual(['titular_suspendido', 'titular_baneado']);
    expect(await types(owner)).toEqual([]);
  });
});
