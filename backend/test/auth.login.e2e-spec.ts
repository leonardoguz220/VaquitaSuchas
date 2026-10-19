import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Inicio de sesión (spec 003, US2). Requiere PostgreSQL (base temporal propia).
describe('Inicio de sesión (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('RF-003-09: credenciales correctas devuelven sesión y UserSelf con CI enmascarada', async () => {
    const user = await t.createUser();
    const res = await t.login(user.email, user.password);
    expect(res.status).toBe(200);
    expect(res.body.sessionToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: user.email,
      role: 'usuario',
      status: 'activo',
      ciMasked: '*****001',
    });
    expect(res.body.user.lastLoginAt).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });

  it('CA-003-05: correo inexistente y contraseña errónea dan estado y cuerpo idénticos', async () => {
    const user = await t.createUser();
    const wrongPassword = await t.login(user.email, 'otra-clave-123');
    const unknownEmail = await t.login('noexiste@example.com', 'otra-clave-123');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('CA-003-18: un usuario suspendido no entra y recibe el mismo mensaje', async () => {
    const user = await t.createUser({ status: 'suspendido' });
    const res = await t.login(user.email, user.password);
    const unknown = await t.login('noexiste@example.com', user.password);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(unknown.body);
  });

  it('CA-003-23: una cuenta baneada no entra y el mensaje no revela el baneo', async () => {
    const user = await t.createUser({ status: 'baneado' });
    const res = await t.login(user.email, user.password);
    const unknown = await t.login('noexiste@example.com', user.password);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(unknown.body);
  });

  it('CA-003-05: una cuenta sin verificar tampoco entra', async () => {
    const reg = await t.register({ email: 'sinverificar@example.com' });
    expect(reg.status).toBe(201);
    const res = await t.login('sinverificar@example.com', 'clave-segura-123');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});
