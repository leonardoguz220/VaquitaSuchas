import { tokenFromUrl, startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Cambio de celular con el bot (spec 003, US4). Requiere PostgreSQL.
describe('Cambio de celular (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  let telegramSeq = 90_000;
  const sessionOf = async (user: { email: string; password: string }) =>
    `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
  const start = (auth: string) =>
    t.http().post('/users/me/phone-change').set('Authorization', auth).send();
  const status = (auth: string) =>
    t.http().get('/users/me/phone-change/status').set('Authorization', auth);
  const me = async (auth: string) =>
    (await t.http().get('/auth/me').set('Authorization', auth)).body;

  it('CA-003-14: el celular nuevo verificado con el bot reemplaza al anterior', async () => {
    const user = await t.createUser();
    const auth = await sessionOf(user);
    const before = (await me(auth)).phone as string;
    const res = await start(auth);
    expect(res.status).toBe(201);
    expect(res.body.verification.expiresAt).toEqual(expect.any(String));
    const telegramUserId = (telegramSeq += 1);
    await t.verifyWithTelegram({
      telegramUserId,
      token: tokenFromUrl(res.body.verification.telegramUrl),
      phoneNumber: '+59172223344',
    });
    const done = await status(auth);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('verified');
    expect(done.body.user.phone).toBe('+59172223344');
    expect(before).not.toBe('+59172223344');
    expect((await me(auth)).phone).toBe('+59172223344');
  });

  it('CA-003-32: sin verificar con el bot se conserva el celular anterior', async () => {
    const user = await t.createUser();
    const auth = await sessionOf(user);
    const before = (await me(auth)).phone as string;
    const res = await start(auth);
    expect((await status(auth)).body.status).toBe('pending');
    // Contacto de otra persona: el bot lo rechaza y nada cambia.
    const telegramUserId = (telegramSeq += 1);
    await t.verifyWithTelegram({
      telegramUserId,
      token: tokenFromUrl(res.body.verification.telegramUrl),
      phoneNumber: '+59173334455',
      contactUserId: telegramUserId + 1,
    });
    expect((await me(auth)).phone).toBe(before);
    expect((await status(auth)).body.status).toBe('expired');
  });

  it('CA-003-32: un celular de otra cuenta se rechaza y se conserva el anterior', async () => {
    const owner = await t.createUser();
    const user = await t.createUser();
    const ownerPhone = (await me(await sessionOf(owner))).phone as string;
    const auth = await sessionOf(user);
    const before = (await me(auth)).phone as string;
    const res = await start(auth);
    await t.verifyWithTelegram({
      telegramUserId: (telegramSeq += 1),
      token: tokenFromUrl(res.body.verification.telegramUrl),
      phoneNumber: ownerPhone,
    });
    const result = await status(auth);
    expect(result.body.status).toBe('rejected');
    expect(result.body.code).toBe('PHONE_ALREADY_REGISTERED');
    expect((await me(auth)).phone).toBe(before);
  });

  it('CA-003-32: el límite compartido de 5 enlaces por hora responde 429', async () => {
    const auth = await sessionOf(await t.createUser());
    for (let i = 0; i < 5; i += 1) expect((await start(auth)).status).toBe(201);
    const res = await start(auth);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('CA-003-32: sin sesión responde 401', async () => {
    expect((await t.http().post('/users/me/phone-change').send()).status).toBe(401);
    expect((await t.http().get('/users/me/phone-change/status')).status).toBe(401);
  });
});
