import { startAuthApp, tokenFromUrl, type AuthTestApp } from './support/auth-app.js';

// Privacidad de logs y de rutas del perfil (spec 003). Requiere PostgreSQL.
describe('Privacidad de logs de la spec 003', () => {
  let t: AuthTestApp;
  const captured: string[] = [];
  const restores: Array<() => void> = [];

  beforeAll(async () => {
    for (const stream of [process.stdout, process.stderr]) {
      const original = stream.write;
      stream.write = function (this: unknown, chunk: unknown, ...rest: never[]) {
        captured.push(String(chunk));
        return (original as (...args: unknown[]) => boolean).call(stream, chunk, ...rest);
      } as typeof stream.write;
      restores.push(() => {
        stream.write = original;
      });
    }
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    restores.forEach((restore) => restore());
    await t?.close();
  }, 30_000);

  it('RNF-003-05: registro, ingreso, cambios de clave y de celular no dejan secretos en la salida', async () => {
    const password = 'Cl4ve-Centinela-9Q7x';
    const newPassword = 'Nueva-Centinela-4Rt2';
    const ci = '7654321';
    const phone = '+59171234567';
    const phoneDigits = '71234567';
    const newPhoneDigits = '72223344';

    const reg = await t.register({
      email: 'centinela@example.com',
      ci,
      password,
      passwordConfirmation: password,
    });
    expect(reg.status).toBe(201);
    const registrationToken = tokenFromUrl(reg.body.verification.telegramUrl);
    await t.verifyWithTelegram({
      telegramUserId: 8101,
      token: registrationToken,
      phoneNumber: phone,
    });
    const polled = await t
      .http()
      .get('/auth/register/status')
      .set('X-Registration-Secret', reg.body.registrationSecret);
    expect(polled.body.status).toBe('verified');

    const login = await t.login('centinela@example.com', password);
    const session = login.body.sessionToken as string;
    const auth = `Bearer ${session}`;
    await t.login('centinela@example.com', 'clave-equivocada-1');
    const change = await t
      .http()
      .post('/auth/password/change')
      .set('Authorization', auth)
      .send({ currentPassword: password, newPassword, newPasswordConfirmation: newPassword });
    const freshSession = change.body.sessionToken as string;
    const start = await t
      .http()
      .post('/users/me/phone-change')
      .set('Authorization', `Bearer ${freshSession}`)
      .send();
    const phoneToken = tokenFromUrl(start.body.verification.telegramUrl);
    await t.verifyWithTelegram({
      telegramUserId: 8102,
      token: phoneToken,
      phoneNumber: '+591' + newPhoneDigits,
    });
    // Un contacto ajeno y un desconocido también pasan por el registro de errores.
    await t.verifyWithTelegram({
      telegramUserId: 8103,
      token: 'token-inexistente',
      phoneNumber: phone,
    });

    const output = captured.join('');
    const secrets = [
      password,
      newPassword,
      ci,
      phoneDigits,
      newPhoneDigits,
      session,
      freshSession,
      registrationToken,
      phoneToken,
      reg.body.registrationSecret as string,
    ];
    for (const secret of secrets) expect(output).not.toContain(secret);
  });

  it('RF-003-16, RN-003-04, RN-003-05: nadie ve el perfil de otro (no existe GET /users/:id)', async () => {
    const mine = await t.createUser();
    const other = await t.createUser();
    const auth = `Bearer ${(await t.login(mine.email, mine.password)).body.sessionToken as string}`;
    for (const url of [`/users/${other.id}`, `/users/${mine.id}`, '/users']) {
      const res = await t.http().get(url).set('Authorization', auth);
      expect(res.status).toBe(404);
    }
  });
});
