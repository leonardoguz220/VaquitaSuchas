import { randomUUID } from 'node:crypto';
import { DbService } from '../src/shared/db/db.service.js';
import { IdentityService } from '../src/modules/users/services/identity.service.js';
import { startAuthApp, tokenFromUrl, type AuthTestApp } from './support/auth-app.js';

// Registro con identidades bloqueadas (spec 003, US1). Requiere PostgreSQL (base temporal propia).
describe('Bloqueo de identidades en el registro (spec 003)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await startAuthApp();
    const identity = t.app.get(IdentityService);
    const db = t.app.get(DbService);
    // Cuenta baneada: sus huellas quedan en banned_identities y la cuenta desaparece.
    const user = await t.db.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
         ci_fingerprint, phone_e164, telegram_user_id, verified_at, data_policy_accepted_at,
         data_policy_version)
       VALUES ('Baneada', 'bane.ado@gmail.com', $1, 'h', '\\x00', $2, '+59175550001', 9100, now(),
         now(), 'v1') RETURNING id`,
      [identity.emailFingerprint('bane.ado@gmail.com'), identity.fingerprint('ci', '7654321')],
    );
    await db.withTransaction((tx) => identity.blockIdentities(tx, user.rows[0]!.id, randomUUID()));
    await t.db.query('DELETE FROM users WHERE id = $1', [user.rows[0]!.id]);
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  }, 30_000);

  const blocked = (res: { status: number; body: { code?: string } }) => {
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REGISTRATION_NOT_ALLOWED');
  };

  it('CA-003-21: el correo de una cuenta baneada con otras mayúsculas se rechaza', async () => {
    blocked(await t.register({ email: 'Bane.Ado@Gmail.com' }));
  });

  it('CA-003-35: un alias de Gmail del correo baneado se rechaza', async () => {
    blocked(await t.register({ email: 'baneado+alias@googlemail.com' }));
  });

  it('CA-003-30: la CI baneada se rechaza con otro correo y el mismo mensaje', async () => {
    const byCi = await t.register({ email: 'otro@example.com', ci: '7654321' });
    const byEmail = await t.register({ email: 'bane.ado@gmail.com' });
    blocked(byCi);
    expect(byCi.body.message).toBe(byEmail.body.message);
  });

  async function verificar(phone: string, telegramUserId: number) {
    const res = await t.register();
    expect(res.status).toBe(201);
    await t.verifyWithTelegram({
      telegramUserId,
      token: tokenFromUrl(res.body.verification.telegramUrl),
      phoneNumber: phone,
    });
    const row = await t.db.query(
      `SELECT u.verified_at, p.outcome FROM users u
         JOIN phone_verification_tokens p ON p.user_id = u.id
        WHERE u.registration_secret_hash IS NOT NULL ORDER BY u.created_at DESC LIMIT 1`,
    );
    return row.rows[0] as { verified_at: Date | null; outcome: string | null };
  }

  it('CA-003-22: el mismo celular con un correo distinto se rechaza en la verificación', async () => {
    const row = await verificar('+59175550001', 9200);
    expect(row.verified_at).toBeNull();
    expect(row.outcome).toBe('rechazado_bloqueado');
  });

  it('CA-003-30: la cuenta de Telegram baneada se rechaza con otros datos', async () => {
    const row = await verificar('+59175550002', 9100);
    expect(row.verified_at).toBeNull();
    expect(row.outcome).toBe('rechazado_bloqueado');
  });
});
