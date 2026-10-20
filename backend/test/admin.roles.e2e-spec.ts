import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  asAdmin,
  auditActions,
  createAdmin,
  randomPassword,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Cambio de responsabilidades del equipo';

// Spec 009, US1: roles de administración (RF-009-03, RN-009-01, RN-009-04). Requiere PostgreSQL.
describe('Roles de administración (spec 009)', () => {
  let t: AuthTestApp;
  let first: AdminActor;

  const setRole = (actor: AdminActor, userId: string, body: unknown) =>
    asAdmin(t, actor, 'post', `/admin/users/${userId}/role`).send(body as object);
  const roleOf = async (userId: string) =>
    (await t.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId])).rows[0]!
      .role;

  beforeAll(async () => {
    t = await startAuthApp();
    first = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-12 / RN-009-01: el último administrador no puede quitarse el rol', async () => {
    const res = await setRole(first, first.id, { role: 'usuario', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LAST_ADMIN');
    expect(res.body.details).toMatchObject({ rule: 'RN-009-01' });
    expect(await roleOf(first.id)).toBe('admin');
    expect(await auditActions(t, first.id)).toEqual([]);
  });

  it('RF-009-03: promover y quitar el rol deja auditoría y cierra las sesiones del afectado', async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    const session = (await t.login(user.email, password)).body.sessionToken as string;

    const promoted = await setRole(first, user.id, { role: 'admin', reason: REASON });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ id: user.id, role: 'admin' });
    expect(
      (await t.http().get('/admin/audit-log').set('Authorization', `Bearer ${session}`)).status,
    ).toBe(401);

    const removed = await setRole(first, user.id, { role: 'usuario', reason: REASON });
    expect(removed.status).toBe(200);
    expect(await roleOf(user.id)).toBe('usuario');
    expect(await auditActions(t, user.id)).toEqual(['rol_promover', 'rol_quitar']);
  });

  it('RN-009-02: con dos administradores nadie se quita el rol a sí mismo', async () => {
    const second = await createAdmin(t);
    const res = await setRole(first, first.id, { role: 'usuario', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ADMIN_TARGET_FORBIDDEN');
    // Quitar el rol a otro administrador sí se puede; el que queda es el último (RN-009-01).
    expect((await setRole(first, second.id, { role: 'usuario', reason: REASON })).status).toBe(200);
    expect((await setRole(first, first.id, { role: 'usuario', reason: REASON })).body.code).toBe(
      'LAST_ADMIN',
    );
  });

  it('RN-009-04: el motivo es obligatorio (10 a 300) y el rol debe ser válido', async () => {
    const user = await t.createUser({ password: randomPassword() });
    for (const body of [
      { role: 'admin' },
      { role: 'admin', reason: 'corto' },
      { role: 'admin', reason: 'x'.repeat(301) },
      { role: 'superadmin', reason: REASON },
      { reason: REASON },
    ]) {
      expect((await setRole(first, user.id, body)).status).toBe(400);
    }
    expect(await roleOf(user.id)).toBe('usuario');
  });

  it('RN-009-03: pedir el rol que la persona ya tiene responde 409 y un id inexistente 404', async () => {
    const user = await t.createUser({ password: randomPassword() });
    expect((await setRole(first, user.id, { role: 'usuario', reason: REASON })).status).toBe(409);
    expect(
      (
        await setRole(first, '00000000-0000-4000-8000-000000000000', {
          role: 'admin',
          reason: REASON,
        })
      ).status,
    ).toBe(404);
  });
});
