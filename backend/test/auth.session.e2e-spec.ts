import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Cierre de sesión y versión de sesión (spec 003, US2). Requiere PostgreSQL (base temporal propia).
describe('Sesión y versión de sesión (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  const me = (token: string) => t.http().get('/auth/me').set('Authorization', `Bearer ${token}`);

  it('CA-003-08: al cerrar sesión el mismo token ya no sirve en el servidor', async () => {
    const user = await t.createUser();
    const token = (await t.login(user.email, user.password)).body.sessionToken as string;
    expect((await me(token)).status).toBe(200);

    const out = await t.http().post('/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(204);

    const after = await me(token);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('UNAUTHENTICATED');
  });

  it('CA-003-33: un token anterior se rechaza tras cerrar sesión o cambiar la versión', async () => {
    const user = await t.createUser();
    const first = (await t.login(user.email, user.password)).body.sessionToken as string;
    await t.http().post('/auth/logout').set('Authorization', `Bearer ${first}`);
    const second = (await t.login(user.email, user.password)).body.sessionToken as string;
    expect((await me(first)).status).toBe(401);
    expect((await me(second)).status).toBe(200);

    // Cambiar la contraseña, un baneo o una suspensión suben la misma versión.
    await t.db.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [
      user.id,
    ]);
    expect((await me(second)).status).toBe(401);
  });

  it('RF-003-08: GET /auth/me devuelve UserSelf con la CI enmascarada', async () => {
    const user = await t.createUser();
    const token = (await t.login(user.email, user.password)).body.sessionToken as string;
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.ciMasked).toMatch(/^\*{5}\d{3}$/);
    expect(res.body).not.toHaveProperty('ci');
  });
});
