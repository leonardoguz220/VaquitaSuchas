// CA-000-02 y RN-000-03: el ejecutor aplica las migraciones sobre una base vacía, en orden,
// y las registra en schema_migrations. También cubre el bloqueo asesor (research R6).
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, schemaMigrations, tableExists } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const quiet = (): void => undefined;

const FIRST = '0001_create_alpha.sql';
const SECOND = '0002_create_beta.sql';

test('CA-000-02: aplica todas las migraciones sobre una base vacía y las registra en schema_migrations', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    // Se escribe primero la 0002 para comprobar que el orden es numérico y no de escritura.
    [SECOND]: 'CREATE TABLE beta (id integer PRIMARY KEY, alpha_id integer REFERENCES alpha (id));',
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY);',
    'README.md': 'no es una migración',
    '0003-Invalid-Name.sql': 'CREATE TABLE ignored (id integer);',
  });
  t.after(() => dir.remove());

  const result = await migrate({
    connectionString: db.connectionString,
    migrationsDir: dir.path,
    log: quiet,
  });

  assert.deepEqual(result.applied, [FIRST, SECOND]);
  assert.deepEqual(result.skipped, []);

  const rows = await schemaMigrations(db.connectionString);
  assert.deepEqual(
    rows.map((row) => [row.version, row.name]),
    [
      ['0001', FIRST],
      ['0002', SECOND],
    ],
  );
  for (const row of rows) {
    assert.match(row.checksum, SHA256_HEX);
    assert.ok(row.applied_at instanceof Date, 'applied_at debe ser timestamptz');
  }

  assert.equal(await tableExists(db.connectionString, 'alpha'), true);
  assert.equal(await tableExists(db.connectionString, 'beta'), true);
  assert.equal(await tableExists(db.connectionString, 'ignored'), false);
});

test('CA-000-02: aplica las migraciones reales de database/migrations sobre una base vacía', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const expected = (await readdir(migrationsDir))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();

  const result = await migrate({
    connectionString: db.connectionString,
    migrationsDir,
    log: quiet,
  });

  assert.deepEqual(result.applied, expected);
  assert.deepEqual(result.skipped, []);
  const rows = await schemaMigrations(db.connectionString);
  assert.deepEqual(
    rows.map((row) => row.name),
    expected,
  );
});

test('RN-000-03: una ejecución posterior solo aplica las migraciones nuevas y conserva los datos', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: [
      'CREATE TABLE alpha (id integer PRIMARY KEY, label text);',
      "INSERT INTO alpha VALUES (1, 'kept');",
    ].join('\n'),
  });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  const first = await migrate(options);
  assert.deepEqual(first.applied, [FIRST]);

  await dir.write({ [SECOND]: 'ALTER TABLE alpha ADD COLUMN extra integer;' });
  const second = await migrate(options);

  assert.deepEqual(second.applied, [SECOND]);
  assert.deepEqual(second.skipped, [FIRST]);
  const data = await queryRows<{ id: number; label: string; extra: number | null }>(
    db.connectionString,
    'SELECT id, label, extra FROM alpha ORDER BY id',
  );
  assert.deepEqual(data, [{ id: 1, label: 'kept', extra: null }]);
  const rows = await schemaMigrations(db.connectionString);
  assert.deepEqual(
    rows.map((row) => row.version),
    ['0001', '0002'],
  );
});

test('RF-000-05: dos ejecuciones en paralelo no chocan gracias al bloqueo asesor', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY);\nSELECT pg_sleep(0.3);',
    [SECOND]: 'CREATE TABLE beta (id integer PRIMARY KEY);',
  });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  const [a, b] = await Promise.all([migrate(options), migrate(options)]);

  const allApplied = [...a.applied, ...b.applied].sort();
  assert.deepEqual(allApplied, [FIRST, SECOND], 'cada migración se aplica exactamente una vez');
  const counts = await queryRows<{ version: string; n: number }>(
    db.connectionString,
    'SELECT version, count(*)::int AS n FROM schema_migrations GROUP BY version ORDER BY version',
  );
  assert.deepEqual(counts, [
    { version: '0001', n: 1 },
    { version: '0002', n: 1 },
  ]);
});

test('spec 000 §8: dos migraciones con el mismo número se rechazan antes de aplicar nada', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY);',
    '0001_create_other.sql': 'CREATE TABLE other (id integer PRIMARY KEY);',
  });
  t.after(() => dir.remove());

  await assert.rejects(
    migrate({ connectionString: db.connectionString, migrationsDir: dir.path, log: quiet }),
    /0001/,
  );
  assert.equal(await tableExists(db.connectionString, 'alpha'), false);
  assert.equal(await tableExists(db.connectionString, 'other'), false);
});
