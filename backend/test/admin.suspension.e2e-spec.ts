import { jest } from '@jest/globals';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  asAdmin,
  auditActions,
  createAdmin,
  randomPassword,
  spyOnMail,
  statusOf,
  type AdminActor,
} from './support/admin-fixtures.js';
import { MailDeliveryError } from '../src/shared/ports/mail.service.js';

const REASON = 'Pagos reportados como falsos por varios titulares';

// Spec 009, US1: suspender y reactivar (RF-009-10, RF-009-11, RN-009-02..04). Requiere PostgreSQL.
describe('Suspensión de usuarios (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const suspend = (userId: string, body: unknown) =>
    asAdmin(t, admin, 'post', `/admin/users/${userId}/suspend`).send(body as object);
  const reactivate = (userId: string, body: unknown = {}) =>
    asAdmin(t, admin, 'post', `/admin/users/${userId}/reactivate`).send(body as object);
  const newUser = async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    return { ...user, password };
  };

  beforeAll(async () => {
    process.env.APPEAL_EMAIL = 'apelaciones@example.com';
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    delete process.env.APPEAL_EMAIL;
    await t?.close();
  }, 30_000);

  it('CA-009-09: suspender cierra las sesiones, bloquea el ingreso, audita y avisa por correo', async () => {
    const { sent } = spyOnMail(t);
    const user = await newUser();
    const session = (await t.login(user.email, user.password)).body.sessionToken as string;

    const res = await suspend(user.id, { reason: `  ${REASON}  ` });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      status: 'suspendido',
      suspension: { reason: REASON },
    });
    expect(await statusOf(t, user.id)).toBe('suspendido');
    const old = await t.http().get('/admin/audit-log').set('Authorization', `Bearer ${session}`);
    expect(old.status).toBe(401);
    expect((await t.login(user.email, user.password)).status).toBeGreaterThanOrEqual(401);
    expect(await auditActions(t, user.id)).toEqual(['usuario_suspender']);
    const open = await t.db.query(
      'SELECT 1 FROM user_suspensions WHERE user_id = $1 AND reactivated_at IS NULL',
      [user.id],
    );
    expect(open.rowCount).toBe(1);
    // RF-009-11: el correo lleva el motivo; el contacto de apelaciones sale de APPEAL_EMAIL.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(user.email);
    expect(sent[0]!.text).toContain(REASON);
    expect(sent[0]!.html).toContain(REASON);
    expect(sent[0]!.text).toContain('apelaciones@example.com');
  });

  it('RF-009-11: si el correo falla, la suspensión se mantiene', async () => {
    spyOnMail(t, new MailDeliveryError('proveedor caído'));
    const user = await newUser();
    const res = await suspend(user.id, { reason: REASON });
    expect(res.status).toBe(200);
    expect(await statusOf(t, user.id)).toBe('suspendido');
    expect(await auditActions(t, user.id)).toEqual(['usuario_suspender']);
  });

  it('CA-009-10: sin motivo, corto (9) o largo (301) se rechaza y nada cambia', async () => {
    const { sent } = spyOnMail(t);
    const user = await newUser();
    for (const body of [
      {},
      { reason: '123456789' },
      { reason: '   corto    ' },
      { reason: 'x'.repeat(301) },
      { reason: 42 },
    ]) {
      const res = await suspend(user.id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await statusOf(t, user.id)).toBe('activo');
    expect(await auditActions(t, user.id)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('CA-009-11: reactivar a un suspendido le permite iniciar sesión otra vez y deja auditoría', async () => {
    spyOnMail(t);
    const user = await newUser();
    await suspend(user.id, { reason: REASON });

    const res = await reactivate(user.id, { reason: 'Se aclaró el malentendido' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, status: 'activo', suspension: null });
    expect((await t.login(user.email, user.password)).status).toBe(200);
    expect(await auditActions(t, user.id)).toEqual(['usuario_suspender', 'usuario_reactivar']);
    const closed = await t.db.query(
      'SELECT reactivated_by FROM user_suspensions WHERE user_id = $1',
      [user.id],
    );
    expect(closed.rows[0].reactivated_by).toBe(admin.id);
  });

  it('RN-009-03: suspender un activo dos veces o reactivar un activo responde 409 INVALID_TRANSITION', async () => {
    spyOnMail(t);
    const user = await newUser();
    expect((await reactivate(user.id)).status).toBe(409);
    await suspend(user.id, { reason: REASON });
    const again = await suspend(user.id, { reason: REASON });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
  });

  it('CA-009-13: suspender a otro administrador o a uno mismo responde 422 ADMIN_TARGET_FORBIDDEN', async () => {
    const { sent } = spyOnMail(t);
    const other = await createAdmin(t);
    const res = await suspend(other.id, { reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ADMIN_TARGET_FORBIDDEN');
    expect(res.body.details).toMatchObject({ rule: 'RN-009-02' });
    expect((await suspend(admin.id, { reason: REASON })).body.code).toBe('ADMIN_TARGET_FORBIDDEN');
    expect(await statusOf(t, other.id)).toBe('activo');
    expect(sent).toEqual([]);
  });

  it('RF-009-10: un usuario inexistente responde 404 y uno normal no puede suspender (403)', async () => {
    expect((await suspend('00000000-0000-4000-8000-000000000000', { reason: REASON })).status).toBe(
      404,
    );
    const user = await newUser();
    const token = (await t.login(user.email, user.password)).body.sessionToken as string;
    const res = await t
      .http()
      .post(`/admin/users/${admin.id}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: REASON });
    expect(res.status).toBe(403);
  });
});
