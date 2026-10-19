import { startAuthApp, tokenFromUrl, type AuthTestApp } from './support/auth-app.js';

// Spec 003 (US1). Se activa con T020 (GET /auth/register/status); el manejador (T019) ya existe.
// Requiere PostgreSQL (base temporal propia).
const describeVerificacion = describe.skip;

describeVerificacion('Verificación del celular con Telegram (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  async function registrar(overrides: Record<string, unknown> = {}) {
    const res = await t.register(overrides);
    expect(res.status).toBe(201);
    return {
      secret: res.body.registrationSecret as string,
      token: tokenFromUrl(res.body.verification.telegramUrl),
    };
  }
  const estado = (secret: string) =>
    t.http().get('/auth/register/status').set('X-Registration-Secret', secret);

  it('CA-003-25: un celular no boliviano se rechaza y la cuenta sigue sin verificar', async () => {
    const { secret, token } = await registrar();
    await t.verifyWithTelegram({ telegramUserId: 8001, token, phoneNumber: '+5491112345678' });
    const res = await estado(secret);
    expect(res.body).toEqual({ status: 'rejected', code: 'PHONE_NOT_BOLIVIAN' });
  });

  it('CA-003-26: celular o cuenta de Telegram ya registrados se rechazan', async () => {
    const a = await registrar();
    await t.verifyWithTelegram({
      telegramUserId: 8002,
      token: a.token,
      phoneNumber: '+59171110001',
    });
    expect((await estado(a.secret)).body.status).toBe('verified');

    const b = await registrar();
    await t.verifyWithTelegram({
      telegramUserId: 8003,
      token: b.token,
      phoneNumber: '+59171110001',
    });
    expect((await estado(b.secret)).body).toEqual({
      status: 'rejected',
      code: 'PHONE_ALREADY_REGISTERED',
    });

    const c = await registrar();
    await t.verifyWithTelegram({
      telegramUserId: 8002,
      token: c.token,
      phoneNumber: '+59171110002',
    });
    expect((await estado(c.secret)).body).toEqual({
      status: 'rejected',
      code: 'TELEGRAM_ALREADY_REGISTERED',
    });
  });

  it('CA-003-27: token válido y contacto propio → celular verificado y sesión', async () => {
    const { secret, token } = await registrar();
    await t.verifyWithTelegram({ telegramUserId: 8004, token, phoneNumber: '+59172220001' });
    const res = await estado(secret);
    expect(res.body.status).toBe('verified');
    expect(res.body.sessionToken).toEqual(expect.any(String));
    expect(res.body.user.phone).toBe('+59172220001');
  });

  it('CA-003-28: token vencido, ya usado o contacto ajeno se rechazan', async () => {
    const vencido = await registrar();
    await t.db.query(
      `UPDATE phone_verification_tokens SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE registration_secret_hash IS NOT NULL
                        ORDER BY created_at DESC LIMIT 1)`,
    );
    await t.verifyWithTelegram({
      telegramUserId: 8005,
      token: vencido.token,
      phoneNumber: '+59173330001',
    });
    expect((await estado(vencido.secret)).body.status).toBe('expired');

    const usado = await registrar();
    await t.verifyWithTelegram({
      telegramUserId: 8006,
      token: usado.token,
      phoneNumber: '+59173330002',
    });
    await t.verifyWithTelegram({
      telegramUserId: 8007,
      token: usado.token,
      phoneNumber: '+59173330003',
    });
    const rows = await t.db.query('SELECT 1 FROM users WHERE phone_e164 = $1', ['+59173330003']);
    expect(rows.rowCount).toBe(0);

    const ajeno = await registrar();
    await t.verifyWithTelegram({
      telegramUserId: 8008,
      token: ajeno.token,
      phoneNumber: '+59173330004',
      contactUserId: 9999,
    });
    expect((await estado(ajeno.secret)).body.status).not.toBe('verified');
  });

  it('CA-003-29: el sexto token en una hora se rechaza con mensaje de espera', async () => {
    const { secret } = await registrar();
    for (let i = 0; i < 4; i += 1) {
      const ok = await t.http().post('/auth/register/link').set('X-Registration-Secret', secret);
      expect(ok.status).toBe(200);
    }
    const sexto = await t.http().post('/auth/register/link').set('X-Registration-Secret', secret);
    expect(sexto.status).toBe(429);
    expect(sexto.body.code).toBe('RATE_LIMITED');
  });

  it('RF-003-21: quien pulsa Iniciar primero retiene el token; otra cuenta de Telegram no lo secuestra', async () => {
    const { secret, token } = await registrar();
    await t
      .http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'start', telegramUserId: 8010, token });
    await t
      .http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'start', telegramUserId: 8011, token });
    await t.http().post('/dev/telegram/simulate').send({
      kind: 'contact',
      telegramUserId: 8011,
      phoneNumber: '+59174440001',
      contactUserId: 8011,
    });
    expect((await estado(secret)).body.status).not.toBe('verified');
    await t.http().post('/dev/telegram/simulate').send({
      kind: 'contact',
      telegramUserId: 8010,
      phoneNumber: '+59174440002',
      contactUserId: 8010,
    });
    expect((await estado(secret)).body.status).toBe('verified');
  });
});
