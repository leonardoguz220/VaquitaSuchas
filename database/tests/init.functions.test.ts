// RF-000-07 (data-model.md §2): 0001_init.sql crea la extensión unaccent y las funciones comunes
// set_updated_at(), forbid_update_delete() e immutable_unaccent(text), sin pgcrypto.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test('RF-000-07: existe la extensión unaccent y no se instala pgcrypto', async () => {
  const rows = await queryRows<{ extname: string }>(
    db.connectionString,
    "SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pgcrypto') ORDER BY extname",
  );
  assert.deepEqual(
    rows.map((row) => row.extname),
    ['unaccent'],
  );
});

test('RF-000-07: gen_random_uuid() funciona sin pgcrypto', async () => {
  const rows = await queryRows<{ a: string; b: string }>(
    db.connectionString,
    'SELECT gen_random_uuid()::text AS a, gen_random_uuid()::text AS b',
  );
  const [row] = rows;
  assert.ok(row);
  assert.match(row.a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(row.a, row.b);
});

test('RF-000-07: immutable_unaccent quita tildes, es IMMUTABLE y sirve en un índice de expresión', async () => {
  await withClient(async (client) => {
    const { rows } = await client.query<{ value: string }>(
      "SELECT immutable_unaccent('Canción Ñandú') AS value",
    );
    assert.equal(rows[0]?.value, 'Cancion Nandu');

    const nullResult = await client.query<{ value: string | null }>(
      'SELECT immutable_unaccent(NULL) AS value',
    );
    assert.equal(nullResult.rows[0]?.value, null, 'STRICT: NULL devuelve NULL');

    const proc = await client.query<{ provolatile: string; proparallel: string }>(
      `SELECT provolatile, proparallel FROM pg_proc
       WHERE proname = 'immutable_unaccent' AND pronamespace = 'public'::regnamespace`,
    );
    assert.deepEqual(proc.rows, [{ provolatile: 'i', proparallel: 's' }]);

    await client.query('CREATE TEMP TABLE services_probe (name text NOT NULL)');
    await client.query(
      'CREATE INDEX services_probe_name_idx ON services_probe (lower(immutable_unaccent(name)))',
    );
    await client.query("INSERT INTO services_probe VALUES ('Música Ñ'), ('Otro')");
    const found = await client.query<{ name: string }>(
      "SELECT name FROM services_probe WHERE lower(immutable_unaccent(name)) = 'musica n'",
    );
    assert.deepEqual(found.rows, [{ name: 'Música Ñ' }]);
  });
});

test('RF-000-07: set_updated_at() renueva updated_at en cada UPDATE', async () => {
  await withClient(async (client) => {
    await client.query(`
      CREATE TEMP TABLE touch_probe (
        id integer PRIMARY KEY,
        label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TRIGGER touch_probe_set_updated_at BEFORE UPDATE ON touch_probe
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
    const old = '2000-01-01T00:00:00Z';
    await client.query(
      "INSERT INTO touch_probe (id, label, created_at, updated_at) VALUES (1, 'a', $1, $1)",
      [old],
    );

    await client.query('BEGIN');
    await client.query("UPDATE touch_probe SET label = 'b' WHERE id = 1");
    const { rows } = await client.query<{
      created_at: Date;
      updated_at: Date;
      tx_now: Date;
    }>('SELECT created_at, updated_at, now() AS tx_now FROM touch_probe WHERE id = 1');
    await client.query('COMMIT');

    const [row] = rows;
    assert.ok(row);
    assert.equal(row.created_at.toISOString(), new Date(old).toISOString());
    assert.ok(row.updated_at > new Date(old), 'updated_at debe cambiar');
    assert.equal(row.updated_at.getTime(), row.tx_now.getTime(), 'updated_at = now()');

    // Aunque el UPDATE intente fijar updated_at, el disparador lo reemplaza.
    await client.query('UPDATE touch_probe SET updated_at = $1 WHERE id = 1', [old]);
    const again = await client.query<{ updated_at: Date }>(
      'SELECT updated_at FROM touch_probe WHERE id = 1',
    );
    assert.ok((again.rows[0]?.updated_at ?? new Date(0)) > new Date(old));
  });
});

test('RF-000-07: forbid_update_delete() permite INSERT y rechaza UPDATE y DELETE', async () => {
  await withClient(async (client) => {
    await client.query('CREATE TEMP TABLE events_probe (id integer PRIMARY KEY, label text)');
    await client.query(`
      CREATE TRIGGER events_probe_forbid_update_delete BEFORE UPDATE OR DELETE ON events_probe
        FOR EACH ROW EXECUTE FUNCTION forbid_update_delete()`);

    await client.query("INSERT INTO events_probe VALUES (1, 'a')");

    const expectRejected = (op: 'UPDATE' | 'DELETE') => (error: unknown) => {
      assert.ok(error instanceof pg.DatabaseError);
      assert.equal(error.message, 'append-only table');
      assert.equal(error.code, '23001', 'restrict_violation');
      assert.equal(error.detail, `events_probe does not allow ${op}`);
      return true;
    };

    await assert.rejects(
      client.query("UPDATE events_probe SET label = 'b' WHERE id = 1"),
      expectRejected('UPDATE'),
    );
    await assert.rejects(
      client.query('DELETE FROM events_probe WHERE id = 1'),
      expectRejected('DELETE'),
    );

    const { rows } = await client.query('SELECT id, label FROM events_probe');
    assert.deepEqual(rows, [{ id: 1, label: 'a' }]);
  });
});
