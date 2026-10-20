// CA-000-03: ejecutar db:migrate sobre una base ya migrada no produce cambios ni errores.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, schemaMigrations, schemaSnapshot } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const quiet = (): void => undefined;
const FIRST = '0001_create_alpha.sql';
const SECOND = '0002_create_beta.sql';

test('CA-000-03: una segunda ejecución no aplica nada, no falla y no cambia el esquema', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY, label text NOT NULL);',
    [SECOND]: 'CREATE TABLE beta (id integer PRIMARY KEY, alpha_id integer REFERENCES alpha (id));',
  });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  const first = await migrate(options);
  assert.deepEqual(first.applied, [FIRST, SECOND]);
  const migrationsBefore = await schemaMigrations(db.connectionString);
  const schemaBefore = await schemaSnapshot(db.connectionString);

  const second = await migrate(options);

  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, [FIRST, SECOND]);
  assert.deepEqual(await schemaMigrations(db.connectionString), migrationsBefore);
  assert.deepEqual(await schemaSnapshot(db.connectionString), schemaBefore);
});

test('CA-000-03: con la carpeta vacía tampoco hay cambios ni errores', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir();
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  assert.deepEqual(await migrate(options), { applied: [], skipped: [] });
  assert.deepEqual(await migrate(options), { applied: [], skipped: [] });
  assert.deepEqual(await schemaMigrations(db.connectionString), []);
});
