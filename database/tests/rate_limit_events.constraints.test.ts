// RF-000-07 (data-model.md §3, rate_limit_events): restricciones de la tabla de límites por ventana.
// Cada restricción se prueba intentando violarla. Los bloqueos de UPDATE y DELETE se prueban en
// append_only.triggers.test.ts (T013).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const NOT_NULL_VIOLATION = '23502';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const quiet = (): void => undefined;

// Así calcula el backend la clave (spec 003, plan §huellas): HMAC-SHA256 en hex.
const validHash = (value: string): string =>
  createHmac('sha256', 'test-only-key').update(value).digest('hex');

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    log: quiet,
  });
});

after(async () => {
  await db.drop();
});

function insert(bucket: unknown, keyHash: unknown): Promise<unknown[]> {
  return queryRows(
    db.connectionString,
    'INSERT INTO rate_limit_events (bucket, key_hash) VALUES ($1, $2) RETURNING id',
    [bucket, keyHash],
  );
}

test('RF-000-07: un evento válido se inserta con id, occurred_at, created_at y updated_at por defecto', async () => {
  const rows = await queryRows<{
    id: string;
    occurred_at: Date;
    created_at: Date;
    updated_at: Date;
    recent: boolean;
  }>(
    db.connectionString,
    `INSERT INTO rate_limit_events (bucket, key_hash) VALUES ($1, $2)
     RETURNING id, occurred_at, created_at, updated_at,
               occurred_at > now() - interval '1 minute' AS recent`,
    ['login_fail:email', validHash('ana@example.com')],
  );
  const row = rows[0];
  assert.ok(row);
  assert.match(row.id, UUID);
  assert.ok(row.occurred_at instanceof Date);
  assert.ok(row.created_at instanceof Date);
  assert.ok(row.updated_at instanceof Date);
  assert.equal(row.recent, true);
});

test('RF-000-07: bucket y key_hash son obligatorios', async () => {
  await assert.rejects(insert(null, validHash('x')), { code: NOT_NULL_VIOLATION });
  await assert.rejects(insert('reset:email', null), { code: NOT_NULL_VIOLATION });
});

test('RF-000-07: existe rate_limit_events_lookup_idx sobre (bucket, key_hash, occurred_at DESC)', async () => {
  const rows = await queryRows<{ indexdef: string }>(
    db.connectionString,
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'rate_limit_events'
       AND indexname = 'rate_limit_events_lookup_idx'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0]?.indexdef ?? '', /\(bucket, key_hash, occurred_at DESC\)/);
});

test('RF-000-07: los disparadores de solo anexado y updated_at están instalados', async () => {
  const rows = await queryRows<{ tgname: string }>(
    db.connectionString,
    `SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.rate_limit_events'::regclass AND NOT tgisinternal
     ORDER BY tgname`,
  );
  assert.deepEqual(
    rows.map((row) => row.tgname),
    ['rate_limit_events_forbid_update_delete', 'rate_limit_events_set_updated_at'],
  );
});
