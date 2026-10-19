// RF-000-06: `db:reset` recrea la base local desde cero (esquema, migraciones y seed) y se niega
// a tocar una base remota o de producción.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isLocalDatabaseUrl } from '../src/cli-support.ts';
import { migrate } from '../src/migrate.ts';
import { reset, ResetRefusedError } from '../src/reset.ts';
import { createTempDatabase, queryRows, schemaMigrations, tableExists } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const quiet = (): void => undefined;
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../seeds/', import.meta.url));

test('RF-000-06: reset borra lo que había, aplica todas las migraciones y deja unaccent instalada', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  await queryRows(db.connectionString, 'CREATE TABLE leftover (id integer PRIMARY KEY)');
  await queryRows(db.connectionString, 'INSERT INTO telegram_updates (update_id) VALUES (42)');
  assert.ok(isLocalDatabaseUrl(db.connectionString), 'la base temporal debe ser local');

  const result = await reset({
    connectionString: db.connectionString,
    migrationsDir,
    seedsDir,
    log: quiet,
  });

  const expected = (await readdir(migrationsDir))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
  assert.deepEqual(result.migrations.applied, expected);
  assert.equal(await tableExists(db.connectionString, 'leftover'), false);
  assert.deepEqual(await queryRows(db.connectionString, 'SELECT * FROM telegram_updates'), []);
  const rows = await schemaMigrations(db.connectionString);
  assert.deepEqual(
    rows.map((row) => row.name),
    expected,
  );
  assert.ok(expected.length >= 4 && expected[0]?.startsWith('0001_'));

  const extensions = await queryRows<{ extname: string; nspname: string }>(
    db.connectionString,
    `SELECT e.extname, n.nspname FROM pg_extension e
     JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'`,
  );
  assert.deepEqual(extensions, [{ extname: 'unaccent', nspname: 'public' }]);
  const unaccented = await queryRows<{ v: string }>(
    db.connectionString,
    "SELECT immutable_unaccent('Música') AS v",
  );
  assert.deepEqual(unaccented, [{ v: 'Musica' }]);
});

test('RF-000-06: reset recrea public con el dueño y el permiso de uso por defecto', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const empty = await createMigrationsDir();
  t.after(() => empty.remove());

  await reset({
    connectionString: db.connectionString,
    migrationsDir: empty.path,
    seedsDir: empty.path,
    log: quiet,
  });

  const rows = await queryRows<{ owner: string; public_usage: boolean }>(
    db.connectionString,
    `SELECT pg_get_userbyid(nspowner) AS owner,
            has_schema_privilege('public', 'public', 'USAGE') AS public_usage
     FROM pg_namespace WHERE nspname = 'public'`,
  );
  assert.deepEqual(rows, [{ owner: 'pg_database_owner', public_usage: true }]);
});

test('RF-000-06: reset se niega con un host remoto, sin conectarse', async () => {
  for (const url of [
    'postgres://u:p@staging.example.com/db',
    'postgres://u:p@dpg-abc123-a.oregon-postgres.render.com:5432/vaquita',
    'postgres://u:p@localhost/db?host=staging.example.com',
  ]) {
    await assert.rejects(
      reset({ connectionString: url, migrationsDir, seedsDir, log: quiet }),
      (error: unknown) => {
        assert.ok(error instanceof ResetRefusedError, `${url} debe rechazarse por política`);
        assert.doesNotMatch(error.message, /u:p@/, 'el mensaje no repite las credenciales');
        return true;
      },
    );
  }
});

test('RF-000-06: reset se niega con NODE_ENV=production aunque la base sea local', async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });

  await assert.rejects(
    reset({
      connectionString: 'postgres://u:p@localhost:5432/db',
      migrationsDir,
      seedsDir,
      log: quiet,
    }),
    ResetRefusedError,
  );
});

test('RF-000-06: los hosts locales son localhost, 127.0.0.1, ::1, db, postgres y el socket', () => {
  for (const url of [
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@127.0.0.1/db',
    'postgres://u:p@[::1]:5432/db',
    'postgres://u:p@db:5432/db',
    'postgres://u:p@postgres/db',
    'postgres:///db?host=/var/run/postgresql',
  ]) {
    assert.equal(isLocalDatabaseUrl(url), true, url);
  }
  assert.equal(isLocalDatabaseUrl('postgres://u:p@10.0.0.5/db'), false);
});
