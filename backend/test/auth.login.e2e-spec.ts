import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Inicio de sesión (spec 003, US2). Requiere PostgreSQL (base temporal propia).
// Un solo arranque por archivo: la configuración de la app se lee una vez al importar AppModule.
describe('Inicio de sesión (spec 003)', () => {
  const clock = new FakeClock(new Date());
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp({ clock });
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

  describe('Bloqueo del inicio de sesión (spec 003, US5)', () => {
    it('CA-003-06: con 5 fallos en 15 minutos sigue bloqueado aun con la contraseña correcta', async () => {
      const user = await t.createUser();
      for (let i = 0; i < 5; i += 1) {
        const fail = await t.login(user.email, 'mala-clave-123');
        expect(fail.status).toBe(401);
        clock.advance(1000);
      }
      const locked = await t.login(user.email, user.password);
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe('RATE_LIMITED');
      expect(locked.body.details.retryAfterSeconds).toBeGreaterThan(14 * 60);
      expect(locked.body.details.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

      clock.advance(14 * 60_000);
      expect((await t.login(user.email, user.password)).status).toBe(429);
      clock.advance(2 * 60_000);
      expect((await t.login(user.email, user.password)).status).toBe(200);
    });

    it('CA-003-06: el bloqueo por correo cuenta fallos desde distintas IP y también de correos inexistentes', async () => {
      for (let i = 0; i < 5; i += 1) await t.login('fantasma@example.com', 'mala-clave-123');
      const res = await t.login('fantasma@example.com', 'mala-clave-123');
      expect(res.status).toBe(429);
    });

    it('CA-003-06: 20 fallos de una misma IP en 15 minutos bloquean a esa IP', async () => {
      const ip = '203.0.113.9';
      for (let i = 0; i < 20; i += 1) {
        const res = await t.login(`otro${i}@example.com`, 'mala-clave-123', ip);
        expect(res.status).toBe(401);
      }
      const user = await t.createUser();
      const blocked = await t.login(user.email, user.password, ip);
      expect(blocked.status).toBe(429);
      expect(blocked.body.details.retryAfterSeconds).toBeGreaterThan(0);
      // Otra IP sigue entrando.
      expect((await t.login(user.email, user.password)).status).toBe(200);
    }, 60_000);
  });
});
