import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Permiso de las rutas de escritura del catálogo (spec 004 CA-004-10; las implementa la spec 009). Requiere PostgreSQL.
describe('Rutas /admin/catalog (spec 004)', () => {
  let t: AuthTestApp;
  let userAuth: string;
  let adminAuth: string;

  beforeAll(async () => {
    t = await startAuthApp();
    const user = await t.createUser();
    const admin = await t.createUser();
    await t.db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
    userAuth = `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
    adminAuth = `Bearer ${(await t.login(admin.email, admin.password)).body.sessionToken as string}`;
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  const ID = '00000000-0000-4000-8000-000000000001';
  const routes: Array<['post' | 'patch', string]> = [
    ['post', '/admin/catalog/services'],
    ['patch', `/admin/catalog/services/${ID}`],
    ['post', `/admin/catalog/services/${ID}/deactivate`],
    ['post', '/admin/catalog/plans'],
    ['patch', `/admin/catalog/plans/${ID}`],
    ['post', '/admin/catalog/import/preview'],
    ['post', '/admin/catalog/import/apply'],
  ];

  it.each(routes)('CA-004-10: %s %s responde 403 a un usuario normal', async (method, url) => {
    const res = await t.http()[method](url).set('Authorization', userAuth).send({});
    expect(res.status).toBe(403);
  });

  it.each(routes)(
    'CA-004-10: %s %s no responde 403 ni 501 a un administrador',
    async (method, url) => {
      const res = await t.http()[method](url).set('Authorization', adminAuth).send({});
      expect([403, 501]).not.toContain(res.status);
    },
  );

  it('CA-004-10: sin sesión responde 401', async () => {
    expect((await t.http().post('/admin/catalog/services').send({})).status).toBe(401);
  });
});
