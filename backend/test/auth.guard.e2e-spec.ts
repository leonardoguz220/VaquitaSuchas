import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Guard de sesión sobre un endpoint real (spec 003, US2). Requiere PostgreSQL (base temporal propia).
describe('Guard de sesión (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-003-07: sin sesión un endpoint protegido responde 401', async () => {
    const res = await t.http().get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('CA-003-20: un JWT manipulado se rechaza con 401', async () => {
    const user = await t.createUser();
    const token = (await t.login(user.email, user.password)).body.sessionToken as string;
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const tampered = Buffer.from(
      JSON.stringify({ ...claims, exp: claims.exp + 1_000_000 }),
    ).toString('base64url');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );

    const variants = [
      `${header}.${tampered}.${signature}`,
      `${header}.${payload}.${signature.slice(0, -2)}xx`,
      `${noneHeader}.${payload}.`,
      'basura',
    ];
    for (const variant of variants) {
      const res = await t.http().get('/auth/me').set('Authorization', `Bearer ${variant}`);
      expect(res.status).toBe(401);
    }
  });
});
