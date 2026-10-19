import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Rutas reservadas de escritura del catálogo (spec 004; las implementa la spec 009). Requiere PostgreSQL.
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

  const routes: Array<['post' | 'patch', string]> = [
    ['post', '/admin/catalog/services'],
    ['patch', '/admin/catalog/services/netflix'],
    ['post', '/admin/catalog/services/netflix/plans'],
    ['patch', '/admin/catalog/plans/netflix-premium'],
  ];

  it.each(routes)('CA-004-10: %s %s responde 403 a un usuario normal', async (method, url) => {
    const res = await t.http()[method](url).set('Authorization', userAuth).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each(routes)('CA-004-10: %s %s responde 501 a un administrador', async (method, url) => {
    const res = await t.http()[method](url).set('Authorization', adminAuth).send({});
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
  });

  it.each(routes)('CA-004-10: %s %s sin sesión responde 401', async (method, url) => {
    const res = await t.http()[method](url).send({});
    expect(res.status).toBe(401);
  });
});
