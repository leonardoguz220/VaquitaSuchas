// Spec 007 (data-model.md §2 y §4): integridad de user_reputation (0060), la copia de lectura de la
// calificación que se recalcula desde los cobros. Cada restricción se prueba intentando violarla.
// Todos los datos son ficticios: el hash de contraseña no corresponde a ninguna contraseña real.
//
// Parte P2 pendiente: las pruebas de charge_reputation_exclusions (dos exclusiones del mismo cobro),
// reputation_reports (dos reportes de la misma persona al mismo cobro) y user_badges (insignia
// repetida) se agregan en T031, cuando existan las tablas de cobros de la spec 002.
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
const MISSING_USER_ID = '00000000-0000-4000-8000-000000000000';

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
  const email = `reputation${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${2000000 + n}`),
    phone_e164: `+5916${String(n).padStart(7, '0')}`,
    telegram_user_id: String(800000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  };
}

async function newUserId(overrides: Record<string, unknown> = {}): Promise<string> {
  const values = { ...defaultUser(), ...overrides };
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

// Una calificación válida: 5 considerados, 4 puntuales y 1 tardío = 4 estrellas, nivel Bueno.
function validReputation(userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    considered_count: 5,
    punctual_count: 4,
    late_count: 1,
    displayed_half_stars: 8,
    level: 'Bueno',
    current_streak: 2,
    rules_version: 1,
    computed_at: new Date(),
  };
}

async function insertReputation(overrides: Record<string, unknown> = {}): Promise<void> {
  const userId = typeof overrides.user_id === 'string' ? overrides.user_id : await newUserId();
  const values = { ...validReputation(userId), ...overrides };
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  await run(
    `INSERT INTO user_reputation (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    Object.values(values),
  );
}

// ---------------------------------------------------------------- filas válidas

test('RF-007-01, RF-007-03: una calificación coherente se guarda', async () => {
  await insertReputation();
});

test('RF-007-02: un usuario "Nuevo" sin estrellas y con menos de 3 cobros se guarda', async () => {
  await insertReputation({
    considered_count: 2,
    punctual_count: 1,
    late_count: 1,
    displayed_half_stars: null,
    level: 'Nuevo',
    current_streak: 0,
  });
  await insertReputation({
    considered_count: 0,
    punctual_count: 0,
    late_count: 0,
    displayed_half_stars: null,
    level: 'Nuevo',
    current_streak: 0,
  });
});

test('RF-007-01: las estrellas mostradas 0 y 10 (medias estrellas) se aceptan', async () => {
  await insertReputation({
    considered_count: 3,
    punctual_count: 0,
    late_count: 3,
    displayed_half_stars: 0,
    level: 'En riesgo',
    current_streak: 0,
  });
  await insertReputation({
    considered_count: 3,
    punctual_count: 3,
    late_count: 0,
    displayed_half_stars: 10,
    level: 'Excelente',
    current_streak: 3,
  });
});

test('RF-007-03: los cinco niveles de la spec se aceptan', async () => {
  await insertReputation({
    considered_count: 1,
    punctual_count: 1,
    late_count: 0,
    displayed_half_stars: null,
    level: 'Nuevo',
  });
  for (const level of ['En riesgo', 'Regular', 'Bueno', 'Excelente']) {
    await insertReputation({ level });
  }
});

// ---------------------------------------------------------------- contadores

test('RNF-007-02: contadores incoherentes (puntuales + tardíos ≠ considerados) fallan', async () => {
  await rejectsWith(insertReputation({ considered_count: 5, punctual_count: 3, late_count: 1 }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_counts_check',
  });
  await rejectsWith(insertReputation({ considered_count: 5, punctual_count: 4, late_count: 2 }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_counts_check',
  });
});

test('RNF-007-02: punctual_count mayor que considered_count falla', async () => {
  await rejectsWith(insertReputation({ considered_count: 5, punctual_count: 6, late_count: -1 }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_punctual_count_check',
  });
});

test('RNF-007-02: punctual_count negativo falla', async () => {
  await rejectsWith(insertReputation({ considered_count: 5, punctual_count: -1, late_count: 6 }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_punctual_count_check',
  });
});

test('RNF-007-02: considered_count negativo falla', async () => {
  // Con considerados negativos ningún punctual_count cabe entre 0 y considered_count, así que
  // fallan a la vez considered_count_check y punctual_count_check: se comprueba solo el código.
  await rejectsWith(
    insertReputation({
      considered_count: -1,
      punctual_count: 0,
      late_count: -1,
      displayed_half_stars: null,
      level: 'Nuevo',
    }),
    { code: CHECK_VIOLATION },
  );
});

test('RF-007-01: current_streak negativo falla', async () => {
  await rejectsWith(insertReputation({ current_streak: -1 }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_current_streak_check',
  });
});

// ---------------------------------------------------------------- nivel y estrellas

test('RF-007-02: nivel "Nuevo" con 3 o más cobros considerados falla', async () => {
  await rejectsWith(
    insertReputation({
      considered_count: 3,
      punctual_count: 3,
      late_count: 0,
      displayed_half_stars: null,
      level: 'Nuevo',
    }),
    { code: CHECK_VIOLATION, constraint: 'user_reputation_new_level_check' },
  );
});

test('RF-007-02: un nivel distinto de "Nuevo" con menos de 3 cobros considerados falla', async () => {
  await rejectsWith(
    insertReputation({
      considered_count: 2,
      punctual_count: 2,
      late_count: 0,
      displayed_half_stars: 10,
      level: 'Excelente',
    }),
    { code: CHECK_VIOLATION, constraint: 'user_reputation_new_level_check' },
  );
});

test('RF-007-02: nivel "Nuevo" con estrellas falla', async () => {
  await rejectsWith(
    insertReputation({
      considered_count: 0,
      punctual_count: 0,
      late_count: 0,
      displayed_half_stars: 5,
      level: 'Nuevo',
    }),
    { code: CHECK_VIOLATION, constraint: 'user_reputation_new_no_stars_check' },
  );
});

test('RF-007-02: un nivel con estrellas NULL falla', async () => {
  await rejectsWith(insertReputation({ displayed_half_stars: null, level: 'Bueno' }), {
    code: CHECK_VIOLATION,
    constraint: 'user_reputation_new_no_stars_check',
  });
});

test('RF-007-01: displayed_half_stars fuera de 0–10 falla (-1 y 11)', async () => {
  for (const stars of [-1, 11]) {
    await rejectsWith(insertReputation({ displayed_half_stars: stars }), {
      code: CHECK_VIOLATION,
      constraint: 'user_reputation_displayed_half_stars_check',
    });
  }
});

test('RF-007-03: un nivel fuera de los cinco de la spec falla', async () => {
  for (const level of ['Malo', 'nuevo', 'excelente', '']) {
    await rejectsWith(insertReputation({ level }), {
      code: CHECK_VIOLATION,
      constraint: 'user_reputation_level_check',
    });
  }
});

// ---------------------------------------------------------------- obligatorios

test('RN-007-07, RF-007-05: rules_version y computed_at son obligatorios', async () => {
  await rejectsWith(insertReputation({ rules_version: null }), {
    code: NOT_NULL_VIOLATION,
    column: 'rules_version',
  });
  await rejectsWith(insertReputation({ computed_at: null }), {
    code: NOT_NULL_VIOLATION,
    column: 'computed_at',
  });
});

test('RNF-007-02: los contadores y el nivel son obligatorios', async () => {
  for (const column of [
    'considered_count',
    'punctual_count',
    'late_count',
    'level',
    'current_streak',
  ]) {
    await rejectsWith(insertReputation({ [column]: null }), { code: NOT_NULL_VIOLATION, column });
  }
});

// ---------------------------------------------------------------- clave y usuario

test('RNF-007-02: una segunda fila del mismo usuario falla (PK)', async () => {
  const userId = await newUserId();
  await insertReputation({ user_id: userId });
  await rejectsWith(insertReputation({ user_id: userId }), {
    code: UNIQUE_VIOLATION,
    constraint: 'user_reputation_pkey',
  });
});

test('RF-007-01: una calificación de un usuario inexistente falla (FK)', async () => {
  await rejectsWith(insertReputation({ user_id: MISSING_USER_ID }), {
    code: FK_VIOLATION,
    constraint: 'user_reputation_user_id_fkey',
  });
});

test('RF-007-01: borrar un usuario con calificación falla (ON DELETE RESTRICT)', async () => {
  const userId = await newUserId();
  await insertReputation({ user_id: userId });
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [userId]), {
    code: FK_VIOLATION,
    constraint: 'user_reputation_user_id_fkey',
  });
});

// ---------------------------------------------------------------- updated_at

test('RF-007-05: un UPDATE (recálculo) actualiza updated_at', async () => {
  const userId = await newUserId();
  const old = new Date('2026-01-01T00:00:00Z');
  await insertReputation({ user_id: userId, created_at: old, updated_at: old });
  await run(
    `UPDATE user_reputation
     SET considered_count = 6, punctual_count = 5, late_count = 1, displayed_half_stars = 8,
         computed_at = now()
     WHERE user_id = $1`,
    [userId],
  );
  const [row] = await run<{ created_at: Date; updated_at: Date }>(
    'SELECT created_at, updated_at FROM user_reputation WHERE user_id = $1',
    [userId],
  );
  assert.ok(row);
  assert.equal(row.created_at.getTime(), old.getTime());
  assert.ok(row.updated_at.getTime() > old.getTime());
});
