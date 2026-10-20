import { IdentityService } from '../src/modules/users/services/identity.service.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  addMember,
  asAdmin,
  createAdmin,
  insertGroup,
  randomPassword,
  type AdminActor,
} from './support/admin-fixtures.js';

// Spec 009, US1: búsqueda y ficha de usuarios (RF-009-08, RF-009-09). Requiere PostgreSQL.
describe('Usuarios en administración (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;
  let camilaId: string;
  let camilaCi: string;

  const get = (url: string) => asAdmin(t, admin, 'get', url);
  const named = async (fullName: string, email: string): Promise<string> => {
    const user = await t.createUser({ email, password: randomPassword() });
    await t.db.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, fullName]);
    return user.id;
  };

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
    camilaId = await named('Camila Pérez', 'cami.perez@example.com');
    await named('CAMILA Gómez', 'otra@example.com');
    await named('Daniel Rojas', 'camila.hermana@example.com');
    await named('Eduardo Ríos', 'eduardo@example.com');
    const row = await t.db.query<{ ci_encrypted: Buffer }>(
      'SELECT ci_encrypted FROM users WHERE id = $1',
      [camilaId],
    );
    camilaCi = t.app.get(IdentityService).decryptCi(row.rows[0]!.ci_encrypted);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-07: buscar «camila» encuentra por nombre (sin tildes ni mayúsculas) y por correo', async () => {
    const res = await get('/admin/users?q=camila');
    expect(res.status).toBe(200);
    const names = (res.body.items as { fullName: string }[]).map((u) => u.fullName).sort();
    expect(names).toEqual(['CAMILA Gómez', 'Camila Pérez', 'Daniel Rojas']);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), status: 'activo', role: 'usuario' }),
    );
  });

  it('CA-009-07: la búsqueda ignora las tildes del texto buscado y de los nombres', async () => {
    const accented = await get(`/admin/users?q=${encodeURIComponent('PÉREZ')}`);
    expect(accented.body.items.map((u: { id: string }) => u.id)).toEqual([camilaId]);
    const plain = await get('/admin/users?q=perez');
    expect(plain.body.items.map((u: { id: string }) => u.id)).toEqual([camilaId]);
  });

  it('CA-009-07: un comodín de LIKE en la búsqueda se trata como texto', async () => {
    expect((await get('/admin/users?q=%25')).body.items).toEqual([]);
  });

  it('CA-009-07: sin resultados devuelve una lista vacía', async () => {
    const res = await get('/admin/users?q=zzzinexistente');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('RF-009-08: filtra por estado y rol, y pagina con cursor', async () => {
    expect((await get('/admin/users?role=admin')).body.items).toHaveLength(1);
    expect((await get('/admin/users?status=baneado')).body.items).toEqual([]);
    const first = await get('/admin/users?limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(`/admin/users?limit=100&cursor=${first.body.nextCursor as string}`);
    const ids = [...first.body.items, ...second.body.items].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
  });

  it('RF-009-08: parámetros inválidos responden 400', async () => {
    expect((await get('/admin/users?status=otro')).status).toBe(400);
    expect((await get('/admin/users?cursor=basura')).status).toBe(400);
  });

  it('CA-009-08: la ficha no incluye contraseñas ni comprobantes', async () => {
    const owner = await insertGroup(t, camilaId);
    const other = await insertGroup(t, admin.id);
    await addMember(t, other, camilaId);
    const res = await get(`/admin/users/${camilaId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: camilaId,
      fullName: 'Camila Pérez',
      email: 'cami.perez@example.com',
      status: 'activo',
      role: 'usuario',
      groupsAsHost: 1,
      groupsAsMember: 1,
      reputation: { level: 'Nuevo', stars: null, consideredCharges: 0 },
      reportsReceived: 0,
      ban: null,
      suspension: null,
      hostEnablement: null,
    });
    expect(owner).toBeDefined();
    const text = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['password', 'hash', 'proof', 'comprobante', 'ci_encrypted']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('CA-009-36: la cédula aparece enmascarada y nunca completa', async () => {
    const res = await get(`/admin/users/${camilaId}`);
    expect(res.body.ciMasked).toBe(`*****${camilaCi.slice(-3)}`);
    expect(JSON.stringify(res.body)).not.toContain(camilaCi);
  });

  it('RF-009-09: un usuario inexistente o un id inválido responde 404 y 400', async () => {
    expect((await get('/admin/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await get('/admin/users/no-es-uuid')).status).toBe(400);
  });
});
