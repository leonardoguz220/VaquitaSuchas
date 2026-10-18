// CA-000-04: una migración que falla a la mitad no deja cambios parciales, el error nombra el
// archivo y el ejecutor no sigue con las migraciones posteriores (RF-000-05).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MigrationError, migrate } from '../src/migrate.ts';
import { createTempDatabase, schemaMigrations, tableExists } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const quiet = (): void => undefined;
const FIRST = '0001_create_alpha.sql';
const BROKEN = '0002_half_done.sql';
const THIRD = '0003_create_gamma.sql';

test('CA-000-04: una migración que falla a la mitad no deja cambios y el error nombra el archivo', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY);',
    [BROKEN]: [
      'CREATE TABLE half_done (id integer PRIMARY KEY);',
      'INSERT INTO half_done VALUES (1);',
      'SELECT 1/0;',
    ].join('\n'),
    [THIRD]: 'CREATE TABLE gamma (id integer PRIMARY KEY);',
  });
  t.after(() => dir.remove());

  await assert.rejects(
    migrate({ connectionString: db.connectionString, migrationsDir: dir.path, log: quiet }),
    (error: unknown) => {
      assert.ok(error instanceof MigrationError, 'debe ser MigrationError');
      assert.equal(error.file, BROKEN);
      assert.match(error.message, /0002_/);
      return true;
    },
  );

  assert.equal(await tableExists(db.connectionString, 'half_done'), false);
  assert.equal(await tableExists(db.connectionString, 'alpha'), true);
  assert.equal(await tableExists(db.connectionString, 'gamma'), false);
  const rows = await schemaMigrations(db.connectionString);
  assert.deepEqual(
    rows.map((row) => row.name),
    [FIRST],
  );
});

test('CA-000-04: tras corregir la migración fallida, la siguiente ejecución la aplica', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({
    [FIRST]: 'CREATE TABLE alpha (id integer PRIMARY KEY);',
    [BROKEN]: 'CREATE TABLE half_done (id integer PRIMARY KEY);\nSELECT 1/0;',
  });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  await assert.rejects(migrate(options), MigrationError);
  await dir.write({ [BROKEN]: 'CREATE TABLE half_done (id integer PRIMARY KEY);' });

  const result = await migrate(options);

  assert.deepEqual(result.applied, [BROKEN]);
  assert.deepEqual(result.skipped, [FIRST]);
  assert.equal(await tableExists(db.connectionString, 'half_done'), true);
});
