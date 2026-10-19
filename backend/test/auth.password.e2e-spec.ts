import { randomUUID } from 'node:crypto';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { resetTokenOf, waitForMessagesTo } from './support/mailpit.js';

// Recuperación de contraseña (spec 003, US3). Requiere PostgreSQL y Mailpit.
describe('Recuperación de contraseña (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  const uniqueEmail = () => `rec-${randomUUID()}@example.com`;
  const forgot = (email: string) => t.http().post('/auth/password/forgot').send({ email });
  const reset = (token: string, newPassword = 'nueva-clave-456') =>
    t
      .http()
      .post('/auth/password/reset')
      .send({ token, newPassword, newPasswordConfirmation: newPassword });
  const sessionOf = async (email: string, password: string) =>
    (await t.login(email, password)).body.sessionToken as string;

  it('CA-003-09: la respuesta es idéntica exista o no la cuenta', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    const existing = await forgot(user.email);
    const missing = await forgot(uniqueEmail());
    expect(existing.status).toBe(202);
    expect(missing.status).toBe(existing.status);
    expect(missing.body).toEqual(existing.body);
  });

  it('CA-003-10: un enlace válido cambia la contraseña, muere y cierra las otras sesiones', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    const oldSession = await sessionOf(user.email, user.password);
    await forgot(user.email);
    const [mail] = await waitForMessagesTo(user.email, 1);
    const token = resetTokenOf(mail!);
    expect(token).not.toBe('');

    expect((await reset(token)).status).toBe(204);

    const again = await reset(token);
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('RESET_TOKEN_INVALID');
    expect(again.body.details.canRequestNew).toBe(true);
    const old = await t.http().get('/auth/me').set('Authorization', `Bearer ${oldSession}`);
    expect(old.status).toBe(401);
    expect((await t.login(user.email, user.password)).status).toBe(401);
    expect((await t.login(user.email, 'nueva-clave-456')).status).toBe(200);

    const mails = await waitForMessagesTo(user.email, 2);
    expect(mails[1]?.Subject).toContain('cambió');
  });

  it('CA-003-11: un enlace de más de 30 minutos se rechaza', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    await forgot(user.email);
    const [mail] = await waitForMessagesTo(user.email, 1);
    await t.db.query(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
      [user.id],
    );
    const res = await reset(resetTokenOf(mail!));
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });

  it('CA-003-12: con dos enlaces seguidos, el primero se rechaza', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    await forgot(user.email);
    await forgot(user.email);
    const [first, second] = await waitForMessagesTo(user.email, 2);
    expect((await reset(resetTokenOf(first!))).status).toBe(410);
    expect((await reset(resetTokenOf(second!))).status).toBe(204);
  });

  it('CA-003-13: el cuarto pedido en una hora se rechaza con tiempo de espera', async () => {
    const email = uniqueEmail();
    for (let i = 0; i < 3; i += 1) expect((await forgot(email)).status).toBe(202);
    const res = await forgot(email);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('CA-003-23: una cuenta suspendida, baneada o sin verificar no recibe enlace y la respuesta es la misma', async () => {
    const baseline = await forgot(uniqueEmail());
    const suspended = await t.createUser({ email: uniqueEmail(), status: 'suspendido' });
    const banned = await t.createUser({ email: uniqueEmail(), status: 'baneado' });
    const unverified = await t.createUser({ email: uniqueEmail() });
    await t.db.query(
      'UPDATE users SET verified_at = NULL, phone_e164 = NULL, telegram_user_id = NULL WHERE id = $1',
      [unverified.id],
    );
    for (const user of [suspended, banned, unverified]) {
      const res = await forgot(user.email);
      expect(res.status).toBe(baseline.status);
      expect(res.body).toEqual(baseline.body);
      const tokens = await t.db.query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [
        user.id,
      ]);
      expect(tokens.rowCount).toBe(0);
    }
  });

  it('RF-003-03: una contraseña nueva débil se rechaza y el enlace sigue sirviendo', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    await forgot(user.email);
    const [mail] = await waitForMessagesTo(user.email, 1);
    const token = resetTokenOf(mail!);
    const weak = await reset(token, 'corta1');
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    expect(weak.body.details.fields.newPassword).toContain('WEAK_PASSWORD');
    expect((await reset(token)).status).toBe(204);
  });

  // Se activa con T038 (POST /auth/password/change).
  it.skip('CA-003-16: el cambio autenticado cierra las otras sesiones y avisa por correo', async () => {
    const user = await t.createUser({ email: uniqueEmail() });
    const other = await sessionOf(user.email, user.password);
    const current = await sessionOf(user.email, user.password);
    const res = await t
      .http()
      .post('/auth/password/change')
      .set('Authorization', `Bearer ${current}`)
      .send({
        currentPassword: user.password,
        newPassword: 'nueva-clave-456',
        newPasswordConfirmation: 'nueva-clave-456',
      });
    expect(res.status).toBe(200);
    expect(res.body.sessionToken).toEqual(expect.any(String));
    const old = await t.http().get('/auth/me').set('Authorization', `Bearer ${other}`);
    expect(old.status).toBe(401);
    const [notice] = await waitForMessagesTo(user.email, 1);
    expect(notice?.Subject).toContain('cambió');
  });
});
