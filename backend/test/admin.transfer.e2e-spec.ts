import { jest } from '@jest/globals';
import { AuditService } from '../src/modules/admin/services/audit.service.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  addMember,
  asAdmin,
  createAdmin,
  insertGroup,
  randomPassword,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Los miembros lo pidieron porque el titular está suspendido';

// Spec 009, US3: transferencia de titularidad por un administrador (RF-009-24). Requiere PostgreSQL.
describe('Transferencia por administración (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const newUser = async () => {
    const user = await t.createUser({ password: randomPassword() });
    return user;
  };
  const transfer = (groupId: string, body: object, actor = admin) =>
    asAdmin(t, actor, 'post', `/admin/groups/${groupId}/transfer-ownership`).send(body);
  const enableHost = (userId: string) =>
    t.db.query(
      `INSERT INTO host_enablements (user_id, reason, enabled_by)
       VALUES ($1, 'Habilitación de prueba del administrador', $2)`,
      [userId, admin.id],
    );
  const suspend = (userId: string) =>
    t.db.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [userId]);
  const ownerOf = async (groupId: string) =>
    (await t.db.query<{ owner_id: string }>('SELECT owner_id FROM groups WHERE id = $1', [groupId]))
      .rows[0]!.owner_id;
  const audit = async (groupId: string) =>
    (
      await t.db.query<{
        action: string;
        reason: string | null;
        metadata: Record<string, unknown>;
      }>(
        'SELECT action, reason, metadata FROM admin_audit_log WHERE target_id = $1 ORDER BY occurred_at, id',
        [groupId],
      )
    ).rows;

  /** Grupo con titular, un miembro habilitado y (opcional) titular suspendido. */
  async function scenario(options: { suspended: boolean; eligible?: boolean }) {
    const owner = await newUser();
    const member = await newUser();
    const groupId = await insertGroup(t, owner.id);
    await addMember(t, groupId, member.id);
    if (options.eligible !== false) await enableHost(member.id);
    if (options.suspended) await suspend(owner.id);
    return { owner, member, groupId };
  }

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-35: con el titular suspendido, el administrador transfiere a un miembro habilitado y queda auditado', async () => {
    const { owner, member, groupId } = await scenario({ suspended: true });

    const res = await transfer(groupId, { toUserId: member.id, reason: REASON });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupId, fromUserId: owner.id, toUserId: member.id });
    expect(await ownerOf(groupId)).toBe(member.id);
    const roles = await t.db.query<{ user_id: string; role: string }>(
      'SELECT user_id, role FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [groupId],
    );
    expect(Object.fromEntries(roles.rows.map((r) => [r.user_id, r.role]))).toEqual({
      [owner.id]: 'miembro',
      [member.id]: 'titular',
    });
    const entries = await audit(groupId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'titularidad_transferir', reason: REASON });
    expect(entries[0]!.metadata).toEqual({
      groupId,
      fromUserId: owner.id,
      toUserId: member.id,
    });
  });

  it('CA-009-35: con el titular activo la transferencia se rechaza (422) y nada cambia', async () => {
    const { owner, member, groupId } = await scenario({ suspended: false });

    const res = await transfer(groupId, { toUserId: member.id, reason: REASON });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BUSINESS_RULE');
    expect(res.body.details).toMatchObject({ rule: 'RF-009-24' });
    expect(await ownerOf(groupId)).toBe(owner.id);
    expect(await audit(groupId)).toEqual([]);
  });

  it('RF-009-24: el destinatario debe ser miembro activo habilitado como titular (RF-001-21)', async () => {
    const noHost = await scenario({ suspended: true, eligible: false });
    const rejected = await transfer(noHost.groupId, { toUserId: noHost.member.id, reason: REASON });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('NOT_HOST_ELIGIBLE');

    const { groupId, owner } = await scenario({ suspended: true });
    const stranger = await newUser();
    await enableHost(stranger.id);
    const outsider = await transfer(groupId, { toUserId: stranger.id, reason: REASON });
    expect(outsider.status).toBe(422);
    expect(outsider.body.details).toMatchObject({ rule: 'RF-001-17' });
    expect(await ownerOf(groupId)).toBe(owner.id);
    expect(await audit(groupId)).toEqual([]);
  });

  it('RF-009-24: motivo corto, destinatario inválido, grupo inexistente y usuario normal responden 400, 400, 404 y 403', async () => {
    const { member, groupId } = await scenario({ suspended: true });
    expect((await transfer(groupId, { toUserId: member.id, reason: 'corto' })).status).toBe(400);
    expect((await transfer(groupId, { toUserId: 'no-uuid', reason: REASON })).status).toBe(400);
    expect(
      (
        await transfer('00000000-0000-4000-8000-000000000000', {
          toUserId: member.id,
          reason: REASON,
        })
      ).status,
    ).toBe(404);
    const password = randomPassword();
    const user = await t.createUser({ password });
    const token = (await t.login(user.email, password)).body.sessionToken as string;
    const denied = await t
      .http()
      .post(`/admin/groups/${groupId}/transfer-ownership`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toUserId: member.id, reason: REASON });
    expect(denied.status).toBe(403);
    expect(await audit(groupId)).toEqual([]);
  });

  it('CA-009-35 (misma transacción): si la auditoría falla no cambia la titularidad', async () => {
    const { owner, member, groupId } = await scenario({ suspended: true });
    const spy = jest
      .spyOn(t.app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('falla simulada'));

    const res = await transfer(groupId, { toUserId: member.id, reason: REASON });
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(await ownerOf(groupId)).toBe(owner.id);
    const titulars = await t.db.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND role = 'titular' AND left_at IS NULL`,
      [groupId],
    );
    expect(titulars.rowCount).toBe(1);
  });
});
