import { jest } from '@jest/globals';
import { BAN_PORT, type BanPort } from '../src/modules/join-requests/ports/ban.port.js';
import { AuditService } from '../src/modules/admin/services/audit.service.js';
import { BanService } from '../src/modules/admin/services/ban.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  addMember,
  asAdmin,
  auditActions,
  createAdmin,
  insertGroup,
  openJoinRequest,
  randomPassword,
  statusOf,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Estafa confirmada con varios comprobantes falsos';

// Spec 009, US1: baneo y su revisión (RF-009-19, RF-009-22, RF-009-23, RN-009-07). Requiere PostgreSQL.
describe('Baneo de usuarios (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;
  let second: AdminActor;

  const ban = (actor: AdminActor, userId: string, body: unknown) =>
    asAdmin(t, actor, 'post', `/admin/users/${userId}/ban`).send(body as object);
  const revoke = (actor: AdminActor, banId: string, body: unknown) =>
    asAdmin(t, actor, 'post', `/admin/bans/${banId}/revoke`).send(body as object);
  const newUser = async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    return { ...user, password };
  };
  const fingerprintKinds = async (userBanId: string) =>
    (
      await t.db.query<{ kind: string }>(
        'SELECT kind FROM banned_identities WHERE ban_ref = $1 ORDER BY kind',
        [userBanId],
      )
    ).rows.map((r) => r.kind);

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

  it('CA-009-22: banear cierra sesiones, bloquea el ingreso y las cuatro huellas, y audita', async () => {
    const user = await newUser();
    const session = (await t.login(user.email, user.password)).body.sessionToken as string;

    const res = await ban(admin, user.id, { reason: `  ${REASON} ` });

    expect(res.status).toBe(200);
    expect(res.body.banId).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      id: user.id,
      status: 'baneado',
      ban: { id: res.body.banId },
    });
    expect(await statusOf(t, user.id)).toBe('baneado');
    expect(
      (await t.http().get('/admin/audit-log').set('Authorization', `Bearer ${session}`)).status,
    ).toBe(401);
    expect((await t.login(user.email, user.password)).status).toBeGreaterThanOrEqual(401);
    expect(await fingerprintKinds(res.body.banId)).toEqual(['ci', 'email', 'phone', 'telegram']);
    // Las huellas son HMAC: ninguna contiene el correo en claro.
    const stored = await t.db.query<{ fingerprint: string }>(
      'SELECT fingerprint FROM banned_identities WHERE ban_ref = $1',
      [res.body.banId],
    );
    for (const row of stored.rows) expect(row.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const registered = await t.register({ email: user.email });
    expect(registered.status).toBe(403);
    expect(registered.body.code).toBe('REGISTRATION_NOT_ALLOWED');
    expect(await auditActions(t, user.id)).toEqual(['usuario_banear']);
    const row = await t.db.query('SELECT reason, banned_by, source FROM bans WHERE id = $1', [
      res.body.banId,
    ]);
    expect(row.rows[0]).toEqual({ reason: REASON, banned_by: admin.id, source: 'admin' });
  });

  it('CA-009-22 (RF-009-19, RF-009-22): un baneo real congela, retira, rechaza y cancela en una transacción', async () => {
    const owner = await newUser();
    const member = await newUser();
    const applicant = await newUser();
    const ownedGroup = await insertGroup(t, owner.id);
    await addMember(t, ownedGroup, member.id);
    const foreignHost = await newUser();
    const foreignGroup = await insertGroup(t, foreignHost.id);
    await addMember(t, foreignGroup, owner.id);
    const incoming = await openJoinRequest(t, ownedGroup, applicant.id);
    const outgoing = await openJoinRequest(t, foreignGroup, (await newUser()).id);
    const own = await openJoinRequest(t, await insertGroup(t, foreignHost.id), owner.id);

    const res = await ban(admin, owner.id, { reason: REASON });

    expect(res.status).toBe(200);
    const frozen = await t.db.query('SELECT frozen_reason FROM groups WHERE id = $1', [ownedGroup]);
    expect(frozen.rows[0].frozen_reason).toBe('titular_baneado');
    const left = await t.db.query(
      'SELECT left_reason FROM group_members WHERE group_id = $1 AND user_id = $2',
      [foreignGroup, owner.id],
    );
    expect(left.rows[0].left_reason).toBe('baneo');
    const status = async (id: string) =>
      (await t.db.query<{ status: string }>('SELECT status FROM join_requests WHERE id = $1', [id]))
        .rows[0]!.status;
    expect(await status(incoming)).toBe('rechazada');
    expect(await status(own)).toBe('cancelada');
    expect(await status(outgoing)).toBe('abierta');
  });

  it('CA-009-22 (misma transacción): si la auditoría falla, no queda baneo, estado ni huellas', async () => {
    const user = await newUser();
    const group = await insertGroup(t, user.id);
    jest
      .spyOn(t.app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('falla simulada'));

    const res = await ban(admin, user.id, { reason: REASON });

    expect(res.status).toBe(500);
    expect(await statusOf(t, user.id)).toBe('activo');
    expect((await t.db.query('SELECT 1 FROM bans WHERE user_id = $1', [user.id])).rowCount).toBe(0);
    expect(
      (await t.db.query('SELECT frozen_at FROM groups WHERE id = $1', [group])).rows[0].frozen_at,
    ).toBeNull();
  });

  it('CA-009-23: sin motivo, corto o demasiado largo se rechaza y nada cambia', async () => {
    const user = await newUser();
    for (const body of [
      {},
      { reason: '123456789' },
      { reason: 'x'.repeat(301) },
      { reason: REASON, disputeId: 'no-uuid' },
    ]) {
      const res = await ban(admin, user.id, body);
      expect(res.status).toBe(400);
    }
    expect(await statusOf(t, user.id)).toBe('activo');
    expect(await auditActions(t, user.id)).toEqual([]);
  });

  it('CA-009-24: reactivar a un baneado responde 422 USER_BANNED y el baneo sigue vigente', async () => {
    const user = await newUser();
    const banned = await ban(admin, user.id, { reason: REASON });
    const res = await asAdmin(t, admin, 'post', `/admin/users/${user.id}/reactivate`).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('USER_BANNED');
    expect(res.body.details).toMatchObject({ rule: 'RF-009-19' });
    expect(await statusOf(t, user.id)).toBe('baneado');
    expect(await fingerprintKinds(banned.body.banId)).toHaveLength(4);
  });

  it('CA-009-29 (RN-009-07): banear a un administrador o a uno mismo responde 422 y banear dos veces 409', async () => {
    const res = await ban(admin, second.id, { reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ADMIN_TARGET_FORBIDDEN');
    expect(res.body.details).toMatchObject({ rule: 'RN-009-07' });
    expect((await ban(admin, admin.id, { reason: REASON })).body.code).toBe(
      'ADMIN_TARGET_FORBIDDEN',
    );
    expect(await statusOf(t, second.id)).toBe('activo');
    const user = await newUser();
    await ban(admin, user.id, { reason: REASON });
    const again = await ban(second, user.id, { reason: REASON });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
    expect(
      (await ban(admin, '00000000-0000-4000-8000-000000000000', { reason: REASON })).status,
    ).toBe(404);
  });

  it('RF-009-19 (BanPort): el puerto de la spec 010 lo implementa el servicio real y banea con reclamo nulo', async () => {
    const port = t.app.get<BanPort>(BAN_PORT);
    expect(port).toBe(t.app.get(BanService));
    const user = await newUser();
    await t.app
      .get(DbService)
      .withTransaction((tx) =>
        port.ban(tx, { adminId: admin.id, userId: user.id, reason: REASON, disputeId: null }),
      );
    expect(await statusOf(t, user.id)).toBe('baneado');
    expect(await auditActions(t, user.id)).toEqual(['usuario_banear']);
  });

  it('CA-009-34 (RF-009-23): otro administrador revierte; el que baneó no; el baneo se revierte una vez', async () => {
    const user = await newUser();
    const group = await insertGroup(t, user.id);
    const banned = await ban(admin, user.id, { reason: REASON });
    const banId = banned.body.banId as string;

    const same = await revoke(admin, banId, { reason: 'Revisión excepcional del caso' });
    expect(same.status).toBe(422);
    expect(same.body.code).toBe('SAME_ADMIN');
    expect((await revoke(second, banId, { reason: 'corto' })).status).toBe(400);
    expect(await statusOf(t, user.id)).toBe('baneado');

    const ok = await revoke(second, banId, { reason: 'Revisión excepcional del caso' });
    expect(ok.status).toBe(200);
    expect(await statusOf(t, user.id)).toBe('activo');
    expect(await fingerprintKinds(banId)).toEqual([]);
    expect((await t.login(user.email, user.password)).status).toBe(200);
    expect((await t.register({ email: user.email })).status).not.toBe(403);
    expect(await auditActions(t, banId)).toEqual(['baneo_revertir']);
    // CA-009-37: el grupo que congeló ese baneo se descongela.
    expect(
      (await t.db.query('SELECT frozen_at FROM groups WHERE id = $1', [group])).rows[0].frozen_at,
    ).toBeNull();

    const twice = await revoke(second, banId, { reason: 'Revisión excepcional del caso' });
    expect(twice.status).toBe(409);
    expect(
      (
        await revoke(second, '00000000-0000-4000-8000-000000000000', {
          reason: 'Revisión excepcional del caso',
        })
      ).status,
    ).toBe(404);
  });

  it('RF-009-23: se puede volver a banear a quien se le revirtió el baneo', async () => {
    const user = await newUser();
    const first = await ban(admin, user.id, { reason: REASON });
    await revoke(second, first.body.banId, { reason: 'Revisión excepcional del caso' });
    expect((await ban(second, user.id, { reason: REASON })).status).toBe(200);
  });

  it('CA-009-01: un usuario normal no puede banear ni revertir (403)', async () => {
    const user = await newUser();
    const token = (await t.login(user.email, user.password)).body.sessionToken as string;
    const res = await t
      .http()
      .post(`/admin/users/${admin.id}/ban`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: REASON });
    expect(res.status).toBe(403);
  });
});
