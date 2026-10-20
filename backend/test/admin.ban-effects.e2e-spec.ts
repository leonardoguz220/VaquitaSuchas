import { jest } from '@jest/globals';
import type { ChargeFactsPort } from '../src/modules/billing/ports/charge-facts.port.js';
import { CHARGE_FACTS_PORT } from '../src/modules/billing/ports/charge-facts.port.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  addMember,
  asAdmin,
  createAdmin,
  insertGroup,
  openJoinRequest,
  randomPassword,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Estafa confirmada con varios comprobantes falsos';
const REVERT = 'Revisión excepcional del caso';

// Spec 009, US1: efectos del baneo sobre grupos, solicitudes y cobros (RF-009-19, RF-009-22).
// Requiere PostgreSQL. CA-009-32 vive en billing.overdue.e2e-spec.ts.
describe('Efectos del baneo (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;
  let second: AdminActor;

  const newUser = async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    return { ...user, password };
  };
  const tokenOf = async (u: { email: string; password: string }) =>
    (await t.login(u.email, u.password)).body.sessionToken as string;
  const ban = (userId: string) =>
    asAdmin(t, admin, 'post', `/admin/users/${userId}/ban`).send({ reason: REASON });
  const request = async (id: string) =>
    (await t.db.query<{ status: string }>('SELECT status FROM join_requests WHERE id = $1', [id]))
      .rows[0]!.status;

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
    second = await createAdmin(t);
  }, 60_000);
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-31: el grupo del titular baneado queda visible, marcado «titular_baneado» y en solo lectura', async () => {
    const owner = await newUser();
    const member = await newUser();
    const groupId = await insertGroup(t, owner.id);
    await addMember(t, groupId, member.id);
    const token = await tokenOf(member);

    expect((await ban(owner.id)).status).toBe(200);

    const detail = await t.http().get(`/groups/${groupId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.frozenReason).toBe('titular_baneado');
    const leave = await t
      .http()
      .post(`/groups/${groupId}/leave`)
      .set('Authorization', `Bearer ${token}`);
    expect(leave.status).toBe(422);
    expect(leave.body.code).toBe('GROUP_FROZEN');
  });

  it('CA-009-33: un miembro baneado en 2 grupos sale de ambos y se avisa en cada uno', async () => {
    const hostA = await newUser();
    const hostB = await newUser();
    const member = await newUser();
    const groupA = await insertGroup(t, hostA.id);
    const groupB = await insertGroup(t, hostB.id);
    await addMember(t, groupA, member.id);
    await addMember(t, groupB, member.id);
    const events: Array<{ type: string; groupId?: string; reason?: string }> = [];
    const publish = TxEventBus.prototype.publish;
    jest.spyOn(t.app.get(TxEventBus), 'publish').mockImplementation(function (
      this: TxEventBus,
      tx,
      event,
    ) {
      events.push(event as never);
      return publish.call(this, tx, event);
    });

    expect((await ban(member.id)).status).toBe(200);

    const left = await t.db.query<{ group_id: string; left_reason: string }>(
      'SELECT group_id, left_reason FROM group_members WHERE user_id = $1 ORDER BY group_id',
      [member.id],
    );
    expect(left.rows.map((r) => [r.group_id, r.left_reason]).sort()).toEqual(
      [
        [groupA, 'baneo'],
        [groupB, 'baneo'],
      ].sort(),
    );
    const removed = events.filter(
      (e) => e.type === 'groups.member-removed' && e.reason === 'baneo',
    );
    expect(removed.map((e) => e.groupId).sort()).toEqual([groupA, groupB].sort());
  });

  it('RF-009-22: solicitudes a su grupo rechazadas, las propias canceladas y las ajenas intactas', async () => {
    const owner = await newUser();
    const applicant = await newUser();
    const ownGroup = await insertGroup(t, owner.id);
    const foreign = await insertGroup(t, (await newUser()).id);
    const incoming = await openJoinRequest(t, ownGroup, applicant.id);
    const own = await openJoinRequest(t, foreign, owner.id);
    const other = await openJoinRequest(t, foreign, applicant.id);

    expect((await ban(owner.id)).status).toBe(200);

    expect(await request(incoming)).toBe('rechazada');
    expect(await request(own)).toBe('cancelada');
    expect(await request(other)).toBe('abierta');
  });

  it('RF-009-22: los cobros de un grupo congelado por baneo se marcan para excluirlos de la reputación', async () => {
    const owner = await newUser();
    const member = await newUser();
    const groupId = await insertGroup(t, owner.id);
    await addMember(t, groupId, member.id);
    const cycle = await t.db.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, total_bs_cents, member_count,
                                   base_share_cents, owner_share_cents, remainder_cents, finalized_at)
       VALUES ($1, '2026-10', $2, 'regular', '2026-10-15', '2026-10-18', '2026-10-15T04:00:00Z',
               10001, 'BS', 10001, 2, 5000, 5001, 1, '2026-10-15T04:00:00Z') RETURNING id`,
      [groupId, owner.id],
    );
    const charge = await t.db.query<{ id: string }>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                            price_cents, currency, total_bs_cents, member_count, issued_at, due_at)
       VALUES ($1, $2, $3, '2026-10', 'ciclo', 'pendiente', 5000, 10001, 'BS', 10001, 2,
               '2026-10-15T04:00:00Z', '2026-10-18T04:00:00Z') RETURNING id`,
      [groupId, member.id, cycle.rows[0]!.id],
    );
    const facts = t.app.get<ChargeFactsPort>(CHARGE_FACTS_PORT);
    const since = new Date('2026-01-01T00:00:00Z');
    const before = await facts.listForUsers(t.db, [member.id], since);
    expect(before.find((f) => f.chargeId === charge.rows[0]!.id)?.groupFrozenByBan).toBe(false);

    expect((await ban(owner.id)).status).toBe(200);

    const after = await facts.listForUsers(t.db, [member.id], since);
    expect(after.find((f) => f.chargeId === charge.rows[0]!.id)?.groupFrozenByBan).toBe(true);
  });

  it('CA-009-37: revertir el baneo descongela los grupos del titular y no restituye pertenencias', async () => {
    const owner = await newUser();
    const host = await newUser();
    const ownGroup = await insertGroup(t, owner.id);
    const foreign = await insertGroup(t, host.id);
    await addMember(t, foreign, owner.id);
    const banned = await ban(owner.id);

    const revoked = await asAdmin(
      t,
      second,
      'post',
      `/admin/bans/${banned.body.banId}/revoke`,
    ).send({
      reason: REVERT,
    });

    expect(revoked.status).toBe(200);
    const frozen = await t.db.query('SELECT frozen_at, frozen_reason FROM groups WHERE id = $1', [
      ownGroup,
    ]);
    expect(frozen.rows[0]).toEqual({ frozen_at: null, frozen_reason: null });
    const membership = await t.db.query(
      'SELECT left_reason FROM group_members WHERE group_id = $1 AND user_id = $2',
      [foreign, owner.id],
    );
    expect(membership.rows[0].left_reason).toBe('baneo');
  });
});
