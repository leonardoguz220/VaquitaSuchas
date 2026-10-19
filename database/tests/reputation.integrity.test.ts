// Spec 007 (data-model.md §2 y §4): integridad de user_reputation (0060), la copia de lectura de la
// calificación que se recalcula desde los cobros, y de la parte P2 (T031):
// charge_reputation_exclusions (0061), reputation_reports (0062) y user_badges (0063). Cada
// restricción se prueba intentando violarla. Todos los datos son ficticios: el hash de contraseña
// no corresponde a ninguna contraseña real.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
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

// La base no ata el nivel a las estrellas (el modelo no lo pide): esa coherencia la garantiza
// levelFor() en el backend. Por eso aquí un mismo valor de estrellas sirve para varios niveles.
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

// La base solo puede exigir que exista rules_version; que el recálculo con la versión vigente dé
// el mismo resultado (RN-007-07) lo verifica la prueba de conciliación del backend
// (reputation.reconcile.e2e-spec.ts, plan.md §8).
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

test('RF-007-05: el upsert del recálculo (ON CONFLICT (user_id) DO UPDATE) deja una sola fila', async () => {
  const userId = await newUserId();
  const old = new Date('2026-01-01T00:00:00Z');
  await insertReputation({ user_id: userId, created_at: old, updated_at: old });
  await run(
    `INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
       displayed_half_stars, level, current_streak, rules_version, computed_at)
     VALUES ($1, 6, 5, 1, 8, 'Bueno', 2, 1, now())
     ON CONFLICT (user_id) DO UPDATE SET
       considered_count = EXCLUDED.considered_count, punctual_count = EXCLUDED.punctual_count,
       late_count = EXCLUDED.late_count, displayed_half_stars = EXCLUDED.displayed_half_stars,
       level = EXCLUDED.level, current_streak = EXCLUDED.current_streak,
       rules_version = EXCLUDED.rules_version, computed_at = EXCLUDED.computed_at`,
    [userId],
  );
  const rows = await run<{
    considered_count: number;
    level: string;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT considered_count, level, created_at, updated_at FROM user_reputation WHERE user_id = $1',
    [userId],
  );
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.ok(row);
  assert.equal(row.considered_count, 6);
  assert.equal(row.level, 'Bueno');
  assert.equal(row.created_at.getTime(), old.getTime());
  assert.ok(row.updated_at.getTime() > old.getTime());
});

// ================================================================ parte P2 (T031)

// Cobro de prueba: grupo con titular, un miembro que entra por una solicitud cerrada (0055 exige
// join_request_id; se inserta con session_replication_role = replica solo en esa transacción),
// un ciclo regular y un cobro de origen 'ciclo' con la copia exacta del ciclo.
let codeSequence = 0;

function nextInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codeSequence += 1;
  let n = codeSequence + 104729;
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (alphabet[n % alphabet.length] ?? 'A') + code;
    n = Math.floor(n / alphabet.length);
  }
  return code;
}

interface TestCharge {
  chargeId: string;
  ownerId: string;
  memberId: string;
}

async function newCharge(): Promise<TestCharge> {
  const ownerId = await newUserId();
  const memberId = await newUserId();
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const { rows: groups } = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code)
       VALUES ($1, 'Grupo de prueba', 'Servicio personalizado', 6000, 'BS', 5, 5, $2)
       RETURNING id`,
      [ownerId, nextInviteCode()],
    );
    const groupId = groups[0]?.id;
    assert.ok(groupId);
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'titular', 'creacion')`,
      [groupId, ownerId],
    );
    await client.query('COMMIT');

    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const { rows: requests } = await client.query<{ id: string }>(
      `INSERT INTO join_requests
         (group_id, applicant_id, opened_at, open_deadline_at, status, final_at, final_reason)
       VALUES ($1, $2, now(), now() + interval '24 hours', 'expirada', now(), 'plazo_solicitud')
       RETURNING id`,
      [groupId, memberId],
    );
    await client.query('COMMIT');

    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
       VALUES ($1, $2, 'miembro', 'solicitud', $3)`,
      [groupId, memberId, requests[0]?.id],
    );
    const { rows: cycles } = await client.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, total_bs_cents, member_count,
                                   base_share_cents, owner_share_cents, remainder_cents,
                                   finalized_at)
       VALUES ($1, $2, '2025-03', 'regular', '2025-03-05', '2025-03-08', '2025-03-05T12:00:00Z',
               6000, 'BS', 6000, 2, 3000, 3000, 0, '2025-03-05T12:00:00Z')
       RETURNING id`,
      [groupId, ownerId],
    );
    const { rows: charges } = await client.query<{ id: string }>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, amount_cents, price_cents,
                            currency, total_bs_cents, member_count, issued_at, due_at)
       VALUES ($1, $2, $3, '2025-03', 'ciclo', 3000, 6000, 'BS', 6000, 2,
               '2025-03-05T12:00:00Z', '2025-03-09T04:00:00Z')
       RETURNING id`,
      [groupId, memberId, cycles[0]?.id],
    );
    const chargeId = charges[0]?.id;
    assert.ok(chargeId);
    return { chargeId, ownerId, memberId };
  } finally {
    await client.end();
  }
}

async function insertInto(table: string, values: Record<string, unknown>): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

// ---------------------------------------------------------------- charge_reputation_exclusions

function exclusion(
  charge: TestCharge,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    charge_id: charge.chargeId,
    reason: 'El comprobante fue un error del banco',
    excluded_by: charge.ownerId,
    ...overrides,
  };
}

test('RF-007-14: una exclusión válida toma excluded_at por defecto', async () => {
  const id = await insertInto('charge_reputation_exclusions', exclusion(await newCharge()));
  const [row] = await run<{ excluded_at: Date | null }>(
    'SELECT excluded_at FROM charge_reputation_exclusions WHERE id = $1',
    [id],
  );
  assert.ok(row?.excluded_at instanceof Date);
});

test('RF-007-14: dos exclusiones del mismo cobro fallan', async () => {
  const charge = await newCharge();
  await insertInto('charge_reputation_exclusions', exclusion(charge));
  await rejectsWith(insertInto('charge_reputation_exclusions', exclusion(charge)), {
    code: UNIQUE_VIOLATION,
    constraint: 'charge_reputation_exclusions_charge_id_key',
  });
});

test('RF-007-14: un motivo de exclusión de 9 o 301 caracteres falla; 10 y 300 pasan', async () => {
  const charge = await newCharge();
  for (const reason of ['a'.repeat(9), 'a'.repeat(301), `  ${'a'.repeat(9)}  `]) {
    await rejectsWith(insertInto('charge_reputation_exclusions', exclusion(charge, { reason })), {
      code: CHECK_VIOLATION,
      constraint: 'charge_reputation_exclusions_reason_check',
    });
  }
  for (const reason of ['a'.repeat(10), 'a'.repeat(300)]) {
    await insertInto('charge_reputation_exclusions', exclusion(await newCharge(), { reason }));
  }
});

test('RF-007-14: una exclusión de un cobro o de un usuario inexistente falla', async () => {
  const charge = await newCharge();
  await rejectsWith(
    insertInto('charge_reputation_exclusions', exclusion(charge, { charge_id: MISSING_USER_ID })),
    { code: FK_VIOLATION, constraint: 'charge_reputation_exclusions_charge_id_fkey' },
  );
  await rejectsWith(
    insertInto('charge_reputation_exclusions', exclusion(charge, { excluded_by: MISSING_USER_ID })),
    { code: FK_VIOLATION, constraint: 'charge_reputation_exclusions_excluded_by_fkey' },
  );
});

test('RF-007-14: cobro, motivo y quien excluye son obligatorios', async () => {
  const charge = await newCharge();
  for (const column of ['charge_id', 'reason', 'excluded_by']) {
    await rejectsWith(
      insertInto('charge_reputation_exclusions', exclusion(charge, { [column]: null })),
      { code: NOT_NULL_VIOLATION, column },
    );
  }
});

test('RF-007-14: borrar un cobro excluido falla (ON DELETE RESTRICT)', async () => {
  const charge = await newCharge();
  await insertInto('charge_reputation_exclusions', exclusion(charge));
  await rejectsWith(run('DELETE FROM charges WHERE id = $1', [charge.chargeId]), {
    code: FK_VIOLATION,
  });
});

// ---------------------------------------------------------------- reputation_reports

function report(
  charge: TestCharge,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    charge_id: charge.chargeId,
    reporter_id: charge.memberId,
    comment: 'Pagué a tiempo y el titular confirmó tarde',
    ...overrides,
  };
}

test('RF-007-14: un reporte nace abierto y sin decisión', async () => {
  const id = await insertInto('reputation_reports', report(await newCharge()));
  const [row] = await run(
    'SELECT status, decided_by, decided_at, decision_reason FROM reputation_reports WHERE id = $1',
    [id],
  );
  assert.deepEqual(row, {
    status: 'abierto',
    decided_by: null,
    decided_at: null,
    decision_reason: null,
  });
});

test('RF-007-14: dos reportes de la misma persona al mismo cobro fallan', async () => {
  const charge = await newCharge();
  await insertInto('reputation_reports', report(charge));
  await rejectsWith(insertInto('reputation_reports', report(charge)), {
    code: UNIQUE_VIOLATION,
    constraint: 'reputation_reports_charge_id_reporter_id_key',
  });
});

test('RF-007-14: el reporte de un cobro ya excluido se guarda (caso borde)', async () => {
  const charge = await newCharge();
  await insertInto('charge_reputation_exclusions', exclusion(charge));
  await insertInto('reputation_reports', report(charge));
});

test('RF-007-14: un comentario de 9 o 301 caracteres falla; 10 y 300 pasan', async () => {
  const charge = await newCharge();
  for (const comment of ['a'.repeat(9), 'a'.repeat(301)]) {
    await rejectsWith(insertInto('reputation_reports', report(charge, { comment })), {
      code: CHECK_VIOLATION,
      constraint: 'reputation_reports_comment_check',
    });
  }
  for (const comment of ['a'.repeat(10), 'a'.repeat(300)]) {
    await insertInto('reputation_reports', report(await newCharge(), { comment }));
  }
});

test('RF-007-14: un estado fuera de abierto, excluido y rechazado falla', async () => {
  const charge = await newCharge();
  await rejectsWith(insertInto('reputation_reports', report(charge, { status: 'cerrado' })), {
    code: CHECK_VIOLATION,
    constraint: 'reputation_reports_status_check',
  });
  const id = await insertInto('reputation_reports', report(charge));
  for (const status of ['excluido', 'rechazado']) {
    await run(
      `UPDATE reputation_reports SET status = $2, decided_by = $3, decided_at = now(),
                                     decision_reason = 'Motivo de la decisión'
       WHERE id = $1`,
      [id, status, charge.ownerId],
    );
  }
});

test('RF-007-14: un reporte de un cobro, de quien reporta o de quien decide inexistente falla', async () => {
  const charge = await newCharge();
  for (const [column, constraint] of [
    ['charge_id', 'reputation_reports_charge_id_fkey'],
    ['reporter_id', 'reputation_reports_reporter_id_fkey'],
    ['decided_by', 'reputation_reports_decided_by_fkey'],
  ] as const) {
    await rejectsWith(
      insertInto('reputation_reports', report(charge, { [column]: MISSING_USER_ID })),
      { code: FK_VIOLATION, constraint },
    );
  }
});

test('RF-007-14: cobro, quien reporta, comentario y estado son obligatorios', async () => {
  const charge = await newCharge();
  for (const column of ['charge_id', 'reporter_id', 'comment', 'status']) {
    await rejectsWith(insertInto('reputation_reports', report(charge, { [column]: null })), {
      code: NOT_NULL_VIOLATION,
      column,
    });
  }
});

// ---------------------------------------------------------------- user_badges

function badge(userId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: userId,
    badge_code: 'racha_3',
    earned_at: new Date(),
    rules_version: 1,
    ...overrides,
  };
}

test('RF-007-06: las seis insignias de la spec se aceptan', async () => {
  const userId = await newUserId();
  for (const code of [
    'primer_pago',
    'racha_3',
    'racha_6',
    'racha_12',
    'sin_atrasos_6m',
    'grupo_completo',
  ]) {
    await insertInto('user_badges', badge(userId, { badge_code: code }));
  }
});

test('RF-007-08: una insignia repetida del mismo usuario falla', async () => {
  const userId = await newUserId();
  await insertInto('user_badges', badge(userId));
  await rejectsWith(insertInto('user_badges', badge(userId)), {
    code: UNIQUE_VIOLATION,
    constraint: 'user_badges_user_id_badge_code_key',
  });
});

test('RF-007-07: la misma insignia para otro usuario pasa', async () => {
  await insertInto('user_badges', badge(await newUserId()));
  await insertInto('user_badges', badge(await newUserId()));
});

test('RF-007-06: un código de insignia fuera de la lista falla', async () => {
  await rejectsWith(
    insertInto('user_badges', badge(await newUserId(), { badge_code: 'racha_24' })),
    { code: CHECK_VIOLATION, constraint: 'user_badges_badge_code_check' },
  );
});

test('RF-007-07: usuario, código, earned_at y rules_version son obligatorios', async () => {
  const userId = await newUserId();
  for (const column of ['user_id', 'badge_code', 'earned_at', 'rules_version']) {
    await rejectsWith(insertInto('user_badges', badge(userId, { [column]: null })), {
      code: NOT_NULL_VIOLATION,
      column,
    });
  }
});

test('RF-007-07: una insignia con un cobro de origen inexistente falla; con uno válido pasa', async () => {
  const charge = await newCharge();
  await rejectsWith(
    insertInto('user_badges', badge(charge.memberId, { source_charge_id: MISSING_USER_ID })),
    { code: FK_VIOLATION, constraint: 'user_badges_source_charge_id_fkey' },
  );
  await insertInto('user_badges', badge(charge.memberId, { source_charge_id: charge.chargeId }));
});

test('RF-007-08: borrar un usuario con insignias falla (ON DELETE RESTRICT)', async () => {
  const userId = await newUserId();
  await insertInto('user_badges', badge(userId));
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [userId]), { code: FK_VIOLATION });
});
