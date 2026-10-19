// Spec 005 (data-model.md §1, T025): integridad de group_invitations (0073). Cada restricción se
// prueba intentando violarla. Todos los datos son ficticios.
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
const NOT_NULL_VIOLATION = '23502';
const FK_VIOLATION = '23503';

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  group = await createGroup();
});

after(async () => {
  await db?.drop();
});

interface PgError {
  code?: string;
  constraint?: string;
}

type Row = Record<string, unknown>;

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

function run<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return queryRows<T>(db.connectionString, sql, params);
}

async function rejectsWith(
  promise: Promise<unknown>,
  expected: { code: string; constraint?: string },
): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.equal(error.code, expected.code);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    return true;
  });
}

async function insertWith(client: pg.Client, table: string, values: Row): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  const [row] = rows;
  assert.ok(row);
  return row.id;
}

async function insertRow(table: string, values: Row): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

let sequence = 0;

function newUserId(): Promise<string> {
  sequence += 1;
  const n = sequence;
  const email = `invite${n}@example.com`;
  return insertRow('users', {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${4000000 + n}`),
    phone_e164: `+5916${String(n + 500).padStart(7, '0')}`,
    telegram_user_id: String(600000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  });
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function inviteCode(n: number): string {
  let value = n + 24593;
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (CODE_ALPHABET[value % CODE_ALPHABET.length] ?? 'A') + code;
    value = Math.floor(value / CODE_ALPHABET.length);
  }
  return code;
}

interface CreatedGroup {
  id: string;
  ownerId: string;
}

// INSERT en groups y la fila del titular en group_members en una sola transacción.
async function createGroup(): Promise<CreatedGroup> {
  const ownerId = await newUserId();
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const id = await insertWith(client, 'groups', {
      owner_id: ownerId,
      name: 'Grupo de prueba',
      service_name_snapshot: 'Servicio personalizado',
      price_cents: 6000,
      currency: 'BS',
      billing_day: 5,
      total_slots: 5,
      invite_code: inviteCode(sequence),
    });
    await insertWith(client, 'group_members', {
      group_id: id,
      user_id: ownerId,
      role: 'titular',
      join_source: 'creacion',
    });
    await client.query('COMMIT');
    return { id, ownerId };
  } finally {
    await client.end();
  }
}

function invitation(group: CreatedGroup, overrides: Row = {}): Row {
  return {
    group_id: group.id,
    invited_by: group.ownerId,
    recipient_email: 'amiga@example.com',
    next_attempt_at: new Date(),
    ...overrides,
  };
}

let group: CreatedGroup;

test('RF-005-14: una invitación nace pendiente, sin enviar y con 0 intentos', async () => {
  const id = await insertRow('group_invitations', invitation(group));
  const [row] = await run('SELECT status, sent_at, attempts FROM group_invitations WHERE id = $1', [
    id,
  ]);
  assert.deepEqual(row, { status: 'pendiente', sent_at: null, attempts: 0 });
});

test('RF-005-14: un correo con mayúsculas o espacios falla', async () => {
  for (const email of ['Amiga@example.com', ' amiga@example.com']) {
    await rejectsWith(
      insertRow('group_invitations', invitation(group, { recipient_email: email })),
      { code: CHECK_VIOLATION, constraint: 'group_invitations_recipient_email_check' },
    );
  }
});

test('RF-005-14: un estado fuera de pendiente, enviada y fallida falla', async () => {
  await rejectsWith(insertRow('group_invitations', invitation(group, { status: 'leida' })), {
    code: CHECK_VIOLATION,
    constraint: 'group_invitations_status_check',
  });
  for (const status of ['enviada', 'fallida']) {
    await insertRow('group_invitations', invitation(group, { status }));
  }
});

test('RF-005-14: attempts negativo falla', async () => {
  await rejectsWith(insertRow('group_invitations', invitation(group, { attempts: -1 })), {
    code: CHECK_VIOLATION,
    constraint: 'group_invitations_attempts_check',
  });
});

test('RF-005-14: grupo, titular, correo y next_attempt_at son obligatorios', async () => {
  for (const column of ['group_id', 'invited_by', 'recipient_email', 'next_attempt_at']) {
    await rejectsWith(insertRow('group_invitations', invitation(group, { [column]: null })), {
      code: NOT_NULL_VIOLATION,
    });
  }
});

test('RF-005-14: una invitación a un grupo o de un usuario inexistente falla', async () => {
  await rejectsWith(insertRow('group_invitations', invitation(group, { group_id: MISSING_ID })), {
    code: FK_VIOLATION,
    constraint: 'group_invitations_group_id_fkey',
  });
  await rejectsWith(insertRow('group_invitations', invitation(group, { invited_by: MISSING_ID })), {
    code: FK_VIOLATION,
    constraint: 'group_invitations_invited_by_fkey',
  });
});

test('RF-005-14: borrar un grupo con invitaciones falla (ON DELETE RESTRICT)', async () => {
  const other = await createGroup();
  await insertRow('group_invitations', invitation(other));
  await rejectsWith(run('DELETE FROM groups WHERE id = $1', [other.id]), { code: FK_VIOLATION });
});

test('RF-005-14: marcar enviada mueve updated_at', async () => {
  const id = await insertRow('group_invitations', invitation(group));
  await run(`UPDATE group_invitations SET updated_at = now() - interval '1 hour' WHERE id = $1`, [
    id,
  ]);
  await run(
    `UPDATE group_invitations SET status = 'enviada', sent_at = now(), attempts = 1 WHERE id = $1`,
    [id],
  );
  const [row] = await run<{ fresh: boolean }>(
    `SELECT updated_at > now() - interval '1 minute' AS fresh FROM group_invitations WHERE id = $1`,
    [id],
  );
  assert.equal(row?.fresh, true);
});

test('RF-005-14: la limpieza a 30 días borra las invitaciones viejas', async () => {
  const old = await insertRow('group_invitations', invitation(group));
  await run(`UPDATE group_invitations SET created_at = now() - interval '31 days' WHERE id = $1`, [
    old,
  ]);
  await run(`DELETE FROM group_invitations WHERE created_at < now() - interval '30 days'`);
  const rows = await run('SELECT id FROM group_invitations WHERE id = $1', [old]);
  assert.equal(rows.length, 0);
});

async function indexdef(name: string): Promise<string> {
  const [index] = await run<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
    [name],
  );
  assert.ok(index, `falta ${name}`);
  return index.indexdef;
}

test('RF-005-14: group_invitations_due_idx indexa las pendientes por next_attempt_at', async () => {
  const def = await indexdef('group_invitations_due_idx');
  assert.ok(
    def.endsWith(
      "ON public.group_invitations USING btree (next_attempt_at) WHERE (status = 'pendiente'::text)",
    ),
    def,
  );
});

test('RF-005-14: group_invitations_group_idx indexa (group_id, created_at DESC)', async () => {
  const def = await indexdef('group_invitations_group_idx');
  assert.ok(
    def.endsWith('ON public.group_invitations USING btree (group_id, created_at DESC)'),
    def,
  );
});
