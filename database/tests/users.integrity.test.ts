// Spec 003 (data-model.md §1 y §4): integridad de users (0010), phone_verification_tokens (0011),
// password_reset_tokens (0012) y banned_identities (0013). Cada restricción se prueba intentando
// violarla. Todos los datos son ficticios: la CI cifrada es un bytea arbitrario, las huellas son
// HMAC con una clave de prueba y el hash de contraseña no corresponde a ninguna contraseña real.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const FK_VIOLATION = '23503';

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

interface PgError {
  code?: string;
  constraint?: string;
  column?: string;
}

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

function run<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return queryRows<T>(db.connectionString, sql, params);
}

async function rejectsWith(
  promise: Promise<unknown>,
  expected: { code: string; constraint?: string; column?: string },
): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.equal(error.code, expected.code);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    if (expected.column) assert.equal(error.column, expected.column);
    return true;
  });
}

// Cada usuario de prueba recibe valores únicos para que las pruebas no choquen entre sí.
let sequence = 0;

function defaultUser(): Record<string, unknown> {
  sequence += 1;
  const n = sequence;
  const email = `user${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${1000000 + n}`),
    phone_e164: `+5917${String(n).padStart(7, '0')}`,
    telegram_user_id: String(900000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  };
}

function insertUser(overrides: Record<string, unknown> = {}): Promise<{ id: string }[]> {
  const values = { ...defaultUser(), ...overrides };
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  return run<{ id: string }>(
    `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
}

async function newUserId(overrides: Record<string, unknown> = {}): Promise<string> {
  const [row] = await insertUser(overrides);
  assert.ok(row);
  return row.id;
}

let tokenSequence = 0;

function tokenHash(): string {
  tokenSequence += 1;
  return fingerprint(`token:${tokenSequence}`);
}

function insertPhoneToken(
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }[]> {
  const values = {
    user_id: userId,
    purpose: 'registro',
    token_hash: tokenHash(),
    requested_ip_hash: fingerprint('ip:192.0.2.1'),
    ...overrides,
  };
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  return run<{ id: string }>(
    `INSERT INTO phone_verification_tokens (${columns.join(', ')}, expires_at)
     VALUES (${placeholders.join(', ')}, now() + interval '10 minutes') RETURNING id`,
    Object.values(values),
  );
}

function insertResetToken(userId: string, hash = tokenHash()): Promise<{ id: string }[]> {
  return run<{ id: string }>(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '30 minutes') RETURNING id`,
    [userId, hash],
  );
}

async function columnsOf(table: string): Promise<string[]> {
  const rows = await run<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

// ---------------------------------------------------------------- users

test('RN-003-01, RN-003-02: un usuario sin verificar válido toma los valores por defecto', async () => {
  const [row] = await run<{
    role: string;
    status: string;
    session_version: number;
    verified_at: Date | null;
  }>(`SELECT role, status, session_version, verified_at FROM users WHERE id = $1`, [
    await newUserId({ phone_e164: null, telegram_user_id: null }),
  ]);
  assert.ok(row);
  assert.equal(row.role, 'usuario');
  assert.equal(row.status, 'activo');
  assert.equal(row.session_version, 0);
  assert.equal(row.verified_at, null);
});

test('CA-003-02: un correo con mayúsculas o espacios falla por el CHECK de normalización', async () => {
  await rejectsWith(insertUser({ email: 'Ana@Example.com' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ email: ' ana@example.com ' }), { code: CHECK_VIOLATION });
});

test('CA-003-02, CA-003-19: dos usuarios con el mismo correo normalizado fallan por UNIQUE', async () => {
  await insertUser({ email: 'ana@example.com' });
  await rejectsWith(insertUser({ email: 'ana@example.com' }), { code: UNIQUE_VIOLATION });
});

test('CA-003-26, RF-003-05: dos usuarios con el mismo celular fallan', async () => {
  await insertUser({ phone_e164: '+59161111111' });
  await rejectsWith(insertUser({ phone_e164: '+59161111111' }), { code: UNIQUE_VIOLATION });
});

test('CA-003-26, RF-003-22: dos usuarios con la misma CI (misma huella) fallan', async () => {
  const ci = fingerprint('ci:7654321');
  await insertUser({ ci_fingerprint: ci });
  await rejectsWith(insertUser({ ci_fingerprint: ci }), { code: UNIQUE_VIOLATION });
});

test('CA-003-26: dos usuarios con la misma cuenta de Telegram fallan', async () => {
  await insertUser({ telegram_user_id: '123456789' });
  await rejectsWith(insertUser({ telegram_user_id: '123456789' }), { code: UNIQUE_VIOLATION });
});

test('CA-003-26: varios usuarios sin verificar pueden no tener celular ni Telegram', async () => {
  await insertUser({ phone_e164: null, telegram_user_id: null });
  await insertUser({ phone_e164: null, telegram_user_id: null });
});

test('CA-003-15: acepta celulares +591 seguidos de 6 o 7 y 7 dígitos', async () => {
  await insertUser({ phone_e164: '+59160000001' });
  await insertUser({ phone_e164: '+59170000001' });
});

test('CA-003-15: un celular fuera del formato +591 + 6/7 + 7 dígitos falla', async () => {
  const invalid = [
    '+5917123456', // 7 dígitos después del prefijo
    '+591712345678', // 9 dígitos
    '+59181234567', // empieza con 8
    '71234567', // sin prefijo
    '59171234567', // sin el signo +
    '+591 71234567', // con espacio
    '+54971234567', // otro país
  ];
  for (const phone of invalid) {
    await rejectsWith(insertUser({ phone_e164: phone }), { code: CHECK_VIOLATION });
  }
});

test('RN-003-03: un usuario común verificado sin celular falla', async () => {
  await rejectsWith(insertUser({ verified_at: new Date(), phone_e164: null }), {
    code: CHECK_VIOLATION,
    constraint: 'users_verified_requires_identity',
  });
});

test('RN-003-03: un usuario común verificado sin Telegram falla', async () => {
  await rejectsWith(insertUser({ verified_at: new Date(), telegram_user_id: null }), {
    code: CHECK_VIOLATION,
    constraint: 'users_verified_requires_identity',
  });
});

test('RN-003-03: un usuario común verificado con celular y Telegram pasa', async () => {
  await insertUser({ verified_at: new Date() });
});

test('RN-003-03: un admin verificado sin celular ni Telegram pasa', async () => {
  await insertUser({
    role: 'admin',
    verified_at: new Date(),
    phone_e164: null,
    telegram_user_id: null,
  });
});

test('RN-003-03: verificar con UPDATE a un usuario común sin celular falla', async () => {
  const id = await newUserId({ phone_e164: null, telegram_user_id: null });
  await rejectsWith(run('UPDATE users SET verified_at = now() WHERE id = $1', [id]), {
    code: CHECK_VIOLATION,
    constraint: 'users_verified_requires_identity',
  });
});

test('RN-003-01: un role fuera de (usuario, admin) falla', async () => {
  await rejectsWith(insertUser({ role: 'superadmin' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ role: 'titular' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ role: null }), { code: NOT_NULL_VIOLATION, column: 'role' });
});

test('RN-003-02: acepta los estados activo, suspendido y baneado', async () => {
  for (const status of ['activo', 'suspendido', 'baneado']) {
    await insertUser({ status });
  }
});

test('RN-003-02: un status fuera de (activo, suspendido, baneado) falla', async () => {
  await rejectsWith(insertUser({ status: 'eliminado' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ status: 'sin_verificar' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ status: null }), { code: NOT_NULL_VIOLATION, column: 'status' });
});

test('RF-003-02: full_name con 1 u 81 caracteres (sin contar espacios de borde) falla', async () => {
  await rejectsWith(insertUser({ full_name: 'A' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ full_name: '   A   ' }), { code: CHECK_VIOLATION });
  await rejectsWith(insertUser({ full_name: 'A'.repeat(81) }), { code: CHECK_VIOLATION });
});

test('RF-003-02: full_name con 2 y con 80 caracteres pasa', async () => {
  await insertUser({ full_name: 'Al' });
  await insertUser({ full_name: 'A'.repeat(80) });
});

test('RF-003-07: session_version negativo falla', async () => {
  await rejectsWith(insertUser({ session_version: -1 }), { code: CHECK_VIOLATION });
});

test('RF-003-02, RF-003-22: los datos obligatorios NULL fallan con not_null_violation', async () => {
  const required = [
    'full_name',
    'email',
    'email_fingerprint',
    'password_hash',
    'ci_encrypted',
    'ci_fingerprint',
    'data_policy_accepted_at',
    'data_policy_version',
  ];
  for (const column of required) {
    await rejectsWith(insertUser({ [column]: null }), { code: NOT_NULL_VIOLATION, column });
  }
});

test('CA-003-27: dos cuentas con el mismo registration_secret_hash fallan', async () => {
  const secret = fingerprint('registration-secret:1');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await insertUser({
    phone_e164: null,
    telegram_user_id: null,
    registration_secret_hash: secret,
    registration_secret_expires_at: expires,
  });
  await rejectsWith(
    insertUser({
      phone_e164: null,
      telegram_user_id: null,
      registration_secret_hash: secret,
      registration_secret_expires_at: expires,
    }),
    { code: UNIQUE_VIOLATION },
  );
});

test('CA-003-27: un registration_secret_hash sin vencimiento falla', async () => {
  await rejectsWith(
    insertUser({ registration_secret_hash: fingerprint('registration-secret:2') }),
    { code: CHECK_VIOLATION, constraint: 'users_registration_secret_pair' },
  );
});

test('CA-003-27: un vencimiento de secreto sin registration_secret_hash falla', async () => {
  await rejectsWith(insertUser({ registration_secret_expires_at: new Date() }), {
    code: CHECK_VIOLATION,
    constraint: 'users_registration_secret_pair',
  });
});

test('CA-003-27: marcar registration_secret_redeemed_at conserva el hash; borrar solo el hash falla', async () => {
  const secret = fingerprint('registration-secret:3');
  const id = await newUserId({
    registration_secret_hash: secret,
    registration_secret_expires_at: new Date(Date.now() + 60_000),
  });
  const [row] = await run<{ registration_secret_hash: string | null; redeemed: boolean }>(
    `UPDATE users SET registration_secret_redeemed_at = now() WHERE id = $1
     RETURNING registration_secret_hash, registration_secret_redeemed_at IS NOT NULL AS redeemed`,
    [id],
  );
  assert.equal(row?.registration_secret_hash, secret);
  assert.equal(row?.redeemed, true);
  await rejectsWith(run('UPDATE users SET registration_secret_hash = NULL WHERE id = $1', [id]), {
    code: CHECK_VIOLATION,
    constraint: 'users_registration_secret_pair',
  });
});

// ---------------------------------------------------------------- phone_verification_tokens

test('RF-003-21: phone_verification_tokens no tiene columna registration_secret_hash (PR #31)', async () => {
  const columns = await columnsOf('phone_verification_tokens');
  assert.ok(columns.length > 0, 'la tabla phone_verification_tokens debe existir');
  assert.ok(!columns.includes('registration_secret_hash'));
});

test('RF-003-21: acepta los purpose y outcome de la spec', async () => {
  const userId = await newUserId({ phone_e164: null, telegram_user_id: null });
  for (const purpose of ['registro', 'cambio_celular']) {
    await insertPhoneToken(userId, { purpose });
  }
  for (const outcome of [
    'verificado',
    'rechazado_no_boliviano',
    'rechazado_contacto_ajeno',
    'rechazado_duplicado',
    'rechazado_bloqueado',
  ]) {
    await insertPhoneToken(userId, { outcome, used_at: new Date() });
  }
});

test('RF-003-21: un purpose fuera de (registro, cambio_celular) falla', async () => {
  const userId = await newUserId();
  await rejectsWith(insertPhoneToken(userId, { purpose: 'login' }), { code: CHECK_VIOLATION });
});

test('RF-003-21: un outcome fuera de los valores de la spec falla', async () => {
  const userId = await newUserId();
  await rejectsWith(insertPhoneToken(userId, { outcome: 'rechazado' }), {
    code: CHECK_VIOLATION,
  });
});

test('RF-003-21: dos tokens de verificación con el mismo token_hash fallan', async () => {
  const userId = await newUserId();
  const hash = tokenHash();
  await insertPhoneToken(userId, { token_hash: hash });
  await rejectsWith(insertPhoneToken(userId, { token_hash: hash }), { code: UNIQUE_VIOLATION });
});

test('RF-003-21: un token de verificación de un usuario inexistente falla', async () => {
  await rejectsWith(insertPhoneToken('00000000-0000-4000-8000-000000000000'), {
    code: FK_VIOLATION,
  });
});

// ---------------------------------------------------------------- password_reset_tokens

test('RF-003-11: dos tokens de recuperación con el mismo token_hash fallan', async () => {
  const userId = await newUserId();
  const hash = tokenHash();
  await insertResetToken(userId, hash);
  await rejectsWith(insertResetToken(userId, hash), { code: UNIQUE_VIOLATION });
});

test('RF-003-11: un token de recuperación de un usuario inexistente falla', async () => {
  await rejectsWith(insertResetToken('00000000-0000-4000-8000-000000000000'), {
    code: FK_VIOLATION,
  });
});

test('RF-003-10, RF-003-13: password_reset_open_idx indexa los tokens de recuperación sin usar', async () => {
  const [index] = await run<{ indexdef: string }>(
    "SELECT indexdef FROM pg_indexes WHERE indexname = 'password_reset_open_idx'",
  );
  assert.ok(index, 'falta password_reset_open_idx');
  assert.ok(
    index.indexdef.endsWith(
      'ON public.password_reset_tokens USING btree (user_id) WHERE (used_at IS NULL)',
    ),
    index.indexdef,
  );
});

test('caso borde "sin verificar a las 24 h": borrar un usuario borra sus tokens (ON DELETE CASCADE)', async () => {
  const userId = await newUserId({ phone_e164: null, telegram_user_id: null });
  const otherId = await newUserId();
  await insertPhoneToken(userId);
  await insertPhoneToken(userId, { purpose: 'cambio_celular' });
  await insertResetToken(userId);
  await insertPhoneToken(otherId);
  await insertResetToken(otherId);

  await run('DELETE FROM users WHERE id = $1', [userId]);

  const [phone] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM phone_verification_tokens WHERE user_id = $1',
    [userId],
  );
  const [reset] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1',
    [userId],
  );
  assert.equal(phone?.n, 0);
  assert.equal(reset?.n, 0);

  const [otherPhone] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM phone_verification_tokens WHERE user_id = $1',
    [otherId],
  );
  const [otherReset] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1',
    [otherId],
  );
  assert.equal(otherPhone?.n, 1, 'los tokens de otro usuario se conservan');
  assert.equal(otherReset?.n, 1, 'los tokens de otro usuario se conservan');
});

// ---------------------------------------------------------------- banned_identities

function insertBan(kind: unknown, fp: string): Promise<unknown[]> {
  return run('INSERT INTO banned_identities (kind, fingerprint) VALUES ($1, $2)', [kind, fp]);
}

test('RF-003-19: acepta huellas de los cuatro kind de la spec', async () => {
  for (const kind of ['email', 'phone', 'ci', 'telegram']) {
    await insertBan(kind, fingerprint(`${kind}:valor-ficticio-aceptado`));
  }
});

test('RF-003-19: un kind fuera de (email, phone, ci, telegram) falla', async () => {
  await rejectsWith(insertBan('cuenta', fingerprint('cuenta:x')), { code: CHECK_VIOLATION });
  await rejectsWith(insertBan(null, fingerprint('null:x')), {
    code: NOT_NULL_VIOLATION,
    column: 'kind',
  });
});

test('RF-003-19: banned_identities rechaza una huella repetida del mismo kind', async () => {
  const fp = fingerprint('email:repetido@example.com');
  await insertBan('email', fp);
  await rejectsWith(insertBan('email', fp), { code: UNIQUE_VIOLATION });
});

test('RF-003-19: la misma huella con distinto kind pasa', async () => {
  const fp = fingerprint('compartida');
  await insertBan('phone', fp);
  await insertBan('telegram', fp);
});

test('CA-003-24: banned_identities solo tiene id, kind, fingerprint, ban_ref, created_at y updated_at', async () => {
  const columns = await columnsOf('banned_identities');
  assert.deepEqual([...columns].sort(), [
    'ban_ref',
    'created_at',
    'fingerprint',
    'id',
    'kind',
    'updated_at',
  ]);
  const plain = columns.filter((name) => /^(email|phone|ci|telegram)(_|$)/.test(name));
  assert.deepEqual(plain, [], 'ninguna columna guarda correo, celular, CI ni Telegram en claro');
});

// T044: users no recibe columnas de otras specs (preferencias en notification_preferences, 0071;
// baneos en bans, 0090) y la FK banned_identities.ban_ref -> bans la agrega la spec 009.
test('RF-003-19: users conserva solo las columnas de la spec 003', async () => {
  const columns = await columnsOf('users');
  assert.deepEqual([...columns].sort(), [
    'ci_encrypted',
    'ci_fingerprint',
    'created_at',
    'data_policy_accepted_at',
    'data_policy_version',
    'email',
    'email_fingerprint',
    'full_name',
    'id',
    'last_login_at',
    'password_hash',
    'phone_e164',
    'registration_secret_expires_at',
    'registration_secret_hash',
    'registration_secret_redeemed_at',
    'role',
    'session_version',
    'status',
    'telegram_user_id',
    'updated_at',
    'verified_at',
  ]);
});

test('RF-003-19: banned_identities.ban_ref es FK a bans (id) sin borrado en cascada', async () => {
  const [fk] = await run<{ target: string; on_delete: string }>(
    `SELECT confrelid::regclass::text AS target, confdeltype::text AS on_delete
     FROM pg_constraint WHERE conname = 'banned_identities_ban_ref_fkey'`,
  );
  assert.deepEqual(fk, { target: 'bans', on_delete: 'r' });
});
