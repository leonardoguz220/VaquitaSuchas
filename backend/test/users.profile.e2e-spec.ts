import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Perfil propio (spec 003, US4). Requiere PostgreSQL.
describe('Perfil propio (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  const sessionOf = async (user: { email: string; password: string }) =>
    `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
  const patch = (auth: string, body: Record<string, unknown>) =>
    t.http().patch('/users/me').set('Authorization', auth).send(body);

  it('CA-003-14: el nombre editado se ve en la cuenta', async () => {
    const user = await t.createUser();
    const auth = await sessionOf(user);
    const res = await patch(auth, { fullName: '  María Nueva  ' });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('María Nueva');
    const me = await t.http().get('/auth/me').set('Authorization', auth);
    expect(me.body.fullName).toBe('María Nueva');
  });

  it('CA-003-14: el nombre debe tener de 2 a 80 caracteres', async () => {
    const auth = await sessionOf(await t.createUser());
    for (const fullName of ['A', ' ', 'x'.repeat(81)]) {
      const res = await patch(auth, { fullName });
      expect(res.status).toBe(400);
      expect(res.body.details.fields.fullName).toContain('INVALID_NAME');
    }
    expect((await patch(auth, { fullName: 'x'.repeat(80) })).status).toBe(200);
  });

  it('RF-003-14: el correo y la CI no se editan', async () => {
    const user = await t.createUser();
    const auth = await sessionOf(user);
    for (const body of [
      { fullName: 'Nombre Válido', email: 'otro@example.com' },
      { fullName: 'Nombre Válido', ci: '1234567' },
    ]) {
      const res = await patch(auth, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FIELD_NOT_EDITABLE');
    }
    const me = await t.http().get('/auth/me').set('Authorization', auth);
    expect(me.body.email).toBe(user.email);
    expect(me.body.fullName).toBe('Usuaria Prueba');
  });

  it('CA-003-14: sin sesión responde 401', async () => {
    const res = await t.http().patch('/users/me').send({ fullName: 'Nombre Válido' });
    expect(res.status).toBe(401);
  });
});
