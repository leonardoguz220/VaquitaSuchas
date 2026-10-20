import { startAuthApp, tokenFromUrl, type AuthTestApp } from './support/auth-app.js';

// Spec 003 (US1).
// Requiere PostgreSQL (base temporal propia).
describe('Registro de cuentas (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-003-01: registro + simulación de Telegram + sondeo → sesión, password_hash en argon2id', async () => {
    const res = await t.register({ email: 'uno@example.com', ci: '1234567' });
    expect(res.status).toBe(201);
    expect(res.body.registrationSecret).toEqual(expect.any(String));
    const token = tokenFromUrl(res.body.verification.telegramUrl);
    expect(token).not.toBe('');

    const pending = await t
      .http()
      .get('/auth/register/status')
      .set('X-Registration-Secret', res.body.registrationSecret);
    expect(pending.body.status).toBe('pending');

    await t.verifyWithTelegram({ telegramUserId: 7001, token, phoneNumber: '+59171234567' });

    const done = await t
      .http()
      .get('/auth/register/status')
      .set('X-Registration-Secret', res.body.registrationSecret);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('verified');
    expect(done.body.sessionToken).toEqual(expect.any(String));
    expect(done.body.user.email).toBe('uno@example.com');
    expect(done.body.user.ciMasked).toBe('*****567');

    const row = await t.db.query('SELECT password_hash, verified_at FROM users WHERE email = $1', [
      'uno@example.com',
    ]);
    expect(row.rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(row.rows[0].verified_at).not.toBeNull();

    // La sesión se entrega una sola vez.
    const again = await t
      .http()
      .get('/auth/register/status')
      .set('X-Registration-Secret', res.body.registrationSecret);
    expect(again.body.sessionToken).toBeUndefined();
  });

  it('CA-003-02: un correo ya registrado con otra capitalización se rechaza', async () => {
    const first = await t.register({ email: 'repetido@example.com' });
    expect(first.status).toBe(201);
    await t.db.query(
      `UPDATE users SET verified_at = now(), phone_e164 = '+59170000001', telegram_user_id = 7002
         WHERE email = 'repetido@example.com'`,
    );
    const res = await t.register({ email: 'Repetido@Example.COM' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('CA-003-03: una contraseña de 8 caracteres se rechaza indicando la política', async () => {
    const res = await t.register({ password: 'abc12345', passwordConfirmation: 'abc12345' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.details)).toContain('WEAK_PASSWORD');
  });

  it('CA-003-25: un registro sin CI se rechaza y no crea la cuenta', async () => {
    const res = await t.register({ email: 'sinci@example.com', ci: undefined });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const rows = await t.db.query('SELECT 1 FROM users WHERE email = $1', ['sinci@example.com']);
    expect(rows.rowCount).toBe(0);
  });

  it('CA-003-34: un registro sin aceptar la política de datos se rechaza', async () => {
    const res = await t.register({ email: 'sinpolitica@example.com', acceptDataPolicy: false });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain('POLICY_NOT_ACCEPTED');
    const rows = await t.db.query('SELECT 1 FROM users WHERE email = $1', [
      'sinpolitica@example.com',
    ]);
    expect(rows.rowCount).toBe(0);
  });
});
