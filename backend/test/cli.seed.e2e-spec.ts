import { PasswordHasher } from '../src/modules/auth/services/password-hasher.js';
import {
  decryptCi,
  fingerprint,
  parseKey,
} from '../src/modules/users/services/identity.service.js';
import { DEV_ADMIN, DEV_USERS, SeedError, seedAdmin, seedDevUsers } from '../src/cli/seed-users.js';
import { BillingHarness } from './support/billing-harness.js';

// Comandos de semilla (spec 003 T022 y T046) contra PostgreSQL real.
describe('Comandos de semilla', () => {
  const harness = new BillingHarness();
  const hasher = new PasswordHasher();
  const CI_KEY = 'cd'.repeat(32);
  const FP_KEY = 'huella-de-prueba-del-seed';
  const baseEnv = {
    CI_ENCRYPTION_KEY: CI_KEY,
    FINGERPRINT_KEY: FP_KEY,
    NODE_ENV: 'development',
  };
  const deps = (env: Record<string, string | undefined>) => ({
    db: harness.pool,
    env: { ...baseEnv, ...env },
    hashPassword: (password: string) => hasher.hash(password),
  });
  const adminEnv = {
    SEED_ADMIN_EMAIL: 'Admin@Vaquita.test',
    SEED_ADMIN_NAME: 'Administrador',
    SEED_ADMIN_PASSWORD: 'clave-de-prueba-123',
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => harness.pool.query('DELETE FROM users'));

  it('RF-003-22 y RN-003-03: crea un admin verificado sin celular ni Telegram y con CI sintética cifrada', async () => {
    const result = await seedAdmin(deps(adminEnv), { allowProduction: false });

    expect(result).toBe('created');
    const { rows } = await harness.pool.query(
      `SELECT email, role, status, verified_at, phone_e164, telegram_user_id, password_hash,
              ci_encrypted, ci_fingerprint FROM users`,
    );
    expect(rows).toHaveLength(1);
    const admin = rows[0];
    expect(admin).toMatchObject({
      email: 'admin@vaquita.test',
      role: 'admin',
      status: 'activo',
      phone_e164: null,
      telegram_user_id: null,
    });
    expect(admin.verified_at).not.toBeNull();
    expect(admin.password_hash).toMatch(/^\$argon2id\$/);
    const ci = decryptCi(admin.ci_encrypted, new Map([[1, parseKey(CI_KEY)]]));
    expect(ci).toMatch(/^ADMIN-[0-9a-f-]{36}$/);
    expect(admin.ci_fingerprint).toBe(fingerprint('ci', ci, FP_KEY));
    expect(await hasher.verify(admin.password_hash, adminEnv.SEED_ADMIN_PASSWORD)).toBe(true);
  });

  it('RF-003-22: es idempotente por correo y no pisa la contraseña de la cuenta existente', async () => {
    await seedAdmin(deps(adminEnv), { allowProduction: false });
    const before = await harness.pool.query('SELECT password_hash, ci_fingerprint FROM users');

    const again = await seedAdmin(
      deps({
        ...adminEnv,
        SEED_ADMIN_EMAIL: ' admin@vaquita.test ',
        SEED_ADMIN_PASSWORD: 'otra-clave-98765',
      }),
      { allowProduction: false },
    );

    expect(again).toBe('exists');
    expect(
      (await harness.pool.query('SELECT password_hash, ci_fingerprint FROM users')).rows,
    ).toEqual(before.rows);
  });

  it('RF-003-22: sin variables o con una contraseña débil falla con un mensaje y no crea nada', async () => {
    for (const missing of ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_NAME', 'SEED_ADMIN_PASSWORD']) {
      await expect(
        seedAdmin(deps({ ...adminEnv, [missing]: undefined }), { allowProduction: false }),
      ).rejects.toThrow(`Falta la variable ${missing}.`);
    }
    await expect(
      seedAdmin(deps({ ...adminEnv, SEED_ADMIN_PASSWORD: 'corta1' }), { allowProduction: false }),
    ).rejects.toBeInstanceOf(SeedError);
    expect((await harness.pool.query('SELECT count(*) AS n FROM users')).rows[0].n).toBe('0');
  });

  it('RF-009-02: en producción solo crea el admin con --allow-production', async () => {
    const production = deps({ ...adminEnv, NODE_ENV: 'production' });

    await expect(seedAdmin(production, { allowProduction: false })).rejects.toThrow(
      '--allow-production',
    );
    expect((await harness.pool.query('SELECT count(*) AS n FROM users')).rows[0].n).toBe('0');
    expect(await seedAdmin(production, { allowProduction: true })).toBe('created');
  });

  it('RF-000-06: crea el titular y tres miembros verificados con datos ficticios y la contraseña del entorno', async () => {
    const results = await seedDevUsers(deps({ SEED_DEV_PASSWORD: 'clave-dev-12345' }));

    expect(Object.values(results)).toEqual(['created', 'created', 'created', 'created', 'created']);
    const { rows } = await harness.pool.query(
      `SELECT email, role, verified_at, phone_e164, telegram_user_id::text AS telegram,
              password_hash, ci_encrypted FROM users WHERE role = 'usuario' ORDER BY email`,
    );
    expect(rows.map((row) => row.email)).toEqual([...DEV_USERS.map((user) => user.email)].sort());
    expect(rows.map((row) => row.email)).toEqual(
      expect.arrayContaining(['titular@dev.vaquita', 'miembro1@dev.vaquita']),
    );
    for (const row of rows) {
      expect(row.role).toBe('usuario');
      expect(row.verified_at).not.toBeNull();
      expect(row.phone_e164).toMatch(/^\+591[67]\d{7}$/);
      expect(row.telegram).toMatch(/^9\d{8}$/);
      expect(await hasher.verify(row.password_hash, 'clave-dev-12345')).toBe(true);
      expect(decryptCi(row.ci_encrypted, new Map([[1, parseKey(CI_KEY)]]))).toMatch(/^DEV-/);
    }
  });

  it('CA-009-31: crea un segundo administrador para que otro revierta el baneo del E2E', async () => {
    await seedDevUsers(deps({ SEED_DEV_PASSWORD: 'clave-dev-12345' }));

    const { rows } = await harness.pool.query(
      `SELECT email, role, verified_at, phone_e164, telegram_user_id, password_hash, ci_encrypted
         FROM users WHERE role = 'admin'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: DEV_ADMIN.email,
      role: 'admin',
      phone_e164: null,
      telegram_user_id: null,
    });
    expect(rows[0].verified_at).not.toBeNull();
    expect(await hasher.verify(rows[0].password_hash, 'clave-dev-12345')).toBe(true);
    expect(decryptCi(rows[0].ci_encrypted, new Map([[1, parseKey(CI_KEY)]]))).toMatch(/^ADMIN-/);
  });

  it('RF-000-06: es idempotente por correo y completa los que falten', async () => {
    const env = { SEED_DEV_PASSWORD: 'clave-dev-12345' };
    await seedDevUsers(deps(env));
    await harness.pool.query(`DELETE FROM users WHERE email = 'miembro3@dev.vaquita'`);

    const again = await seedDevUsers(deps(env));

    expect(again).toEqual({
      'titular@dev.vaquita': 'exists',
      'miembro1@dev.vaquita': 'exists',
      'miembro2@dev.vaquita': 'exists',
      'miembro3@dev.vaquita': 'created',
      'admin2@dev.vaquita': 'exists',
    });
    expect((await harness.pool.query('SELECT count(*) AS n FROM users')).rows[0].n).toBe('5');
  });

  it('RF-000-06: no corre en producción ni sin SEED_DEV_PASSWORD', async () => {
    await expect(
      seedDevUsers(deps({ SEED_DEV_PASSWORD: 'clave-dev-12345', NODE_ENV: 'production' })),
    ).rejects.toThrow('producción');
    await expect(seedDevUsers(deps({}))).rejects.toThrow('Falta la variable SEED_DEV_PASSWORD.');
    expect((await harness.pool.query('SELECT count(*) AS n FROM users')).rows[0].n).toBe('0');
  });
});
