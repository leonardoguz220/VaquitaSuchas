import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Las respuestas no filtran secretos ni datos ajenos (spec 003, US4). Requiere PostgreSQL.
describe('Fuga de datos en las respuestas (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-003-17: las respuestas no traen contraseña, hash, CI ni correos ajenos', async () => {
    const mine = await t.createUser({ email: 'propia@example.com' });
    const other = await t.createUser({ email: 'ajena@example.com' });
    const login = await t.login(mine.email, mine.password);
    const auth = `Bearer ${login.body.sessionToken as string}`;
    const me = await t.http().get('/auth/me').set('Authorization', auth);
    const patch = await t
      .http()
      .patch('/users/me')
      .set('Authorization', auth)
      .send({ fullName: 'Nombre Nuevo' });
    const phone = await t.http().get('/users/me/phone-change/status').set('Authorization', auth);

    for (const res of [login, me, patch, phone]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(other.email);
      expect(text).not.toContain(mine.password);
      expect(text.toLowerCase()).not.toMatch(/password|hash|"ci"|ciencrypted|fingerprint/);
    }
    expect(Object.keys(me.body).sort()).toEqual(
      [
        'ciMasked',
        'createdAt',
        'email',
        'fullName',
        'id',
        'lastLoginAt',
        'phone',
        'role',
        'status',
      ].sort(),
    );
  });

  it('CA-003-31: la CI propia sale enmascarada y la ajena nunca aparece', async () => {
    const mine = await t.createUser();
    const other = await t.createUser();
    const ciOf = async (userId: string) => {
      const row = await t.db.query<{ ci_fingerprint: string }>(
        'SELECT ci_fingerprint FROM users WHERE id = $1',
        [userId],
      );
      return row.rows[0]!.ci_fingerprint;
    };
    const auth = `Bearer ${(await t.login(mine.email, mine.password)).body.sessionToken as string}`;
    const me = await t.http().get('/auth/me').set('Authorization', auth);
    expect(me.body.ciMasked).toMatch(/^\*{5}\d{3}$/);
    const text = JSON.stringify(me.body);
    expect(text).not.toContain(await ciOf(mine.id));
    expect(text).not.toContain(await ciOf(other.id));
    // No existe una ruta para ver el perfil de otra persona (RN-003-04).
    const peer = await t.http().get(`/users/${other.id}`).set('Authorization', auth);
    expect(peer.status).toBe(404);
  });
});
