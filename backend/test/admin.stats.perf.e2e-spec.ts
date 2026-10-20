import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { asAdmin, createAdmin } from './support/admin-fixtures.js';

// Spec 009, CA-009-21: el tablero con 10.000 usuarios responde en menos de 2 s. Requiere PostgreSQL.
describe('Estadísticas: rendimiento (spec 009)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-21: 10.000 usuarios en menos de 2 s', async () => {
    const admin = await createAdmin(t);
    await t.db.query(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version, verified_at,
                          phone_e164, telegram_user_id, last_login_at)
       SELECT 'Usuario ' || g, 'perf' || g || '@example.test', 'perf-fp-' || g, 'x', '\\x00',
              'perf-ci-' || g, now(), 'v1', now(), '+5917' || lpad(g::text, 7, '0'), 9000000 + g, now()
         FROM generate_series(1, 10000) AS g`,
    );

    const started = performance.now();
    const res = await asAdmin(t, admin, 'get', '/admin/stats');
    const elapsed = performance.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(10000);
    expect(elapsed).toBeLessThan(2000);
  }, 60_000);
});
