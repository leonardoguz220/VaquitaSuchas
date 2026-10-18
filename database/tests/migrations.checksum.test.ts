// RN-000-02: una migración ya aplicada no se edita. Si su checksum cambia, el ejecutor se niega
// a continuar y no aplica nada nuevo. Los finales de línea (CRLF/LF) no cuentan como cambio.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { MigrationChecksumError, migrate } from '../src/migrate.ts';
import { createTempDatabase, schemaMigrations, tableExists } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const quiet = (): void => undefined;
const FIRST = '0001_create_alpha.sql';
const SECOND = '0002_create_beta.sql';
const FIRST_SQL = 'CREATE TABLE alpha (\n  id integer PRIMARY KEY\n);\n';
const toCrlf = (text: string): string => text.replace(/\n/g, '\r\n');

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('RN-000-02: guarda el SHA-256 del contenido con finales de línea normalizados a LF', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({ [FIRST]: toCrlf(FIRST_SQL) });
  t.after(() => dir.remove());

  await migrate({ connectionString: db.connectionString, migrationsDir: dir.path, log: quiet });

  const rows = await schemaMigrations(db.connectionString);
  assert.equal(rows[0]?.checksum, sha256(FIRST_SQL));
});

test('RN-000-02: rechaza una migración aplicada cuyo contenido cambió y no aplica las nuevas', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({ [FIRST]: FIRST_SQL });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  await migrate(options);
  const before = await schemaMigrations(db.connectionString);

  await dir.write({
    [FIRST]: 'CREATE TABLE alpha (\n  id integer PRIMARY KEY,\n  edited text\n);\n',
    [SECOND]: 'CREATE TABLE beta (id integer PRIMARY KEY);',
  });

  await assert.rejects(migrate(options), (error: unknown) => {
    assert.ok(error instanceof MigrationChecksumError, 'debe ser MigrationChecksumError');
    assert.equal(error.file, FIRST);
    assert.match(error.message, /0001_create_alpha\.sql/);
    return true;
  });

  assert.equal(await tableExists(db.connectionString, 'beta'), false);
  assert.deepEqual(await schemaMigrations(db.connectionString), before);
});

test('RN-000-02: cambiar solo los finales de línea (LF a CRLF) no cambia el checksum', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const dir = await createMigrationsDir({ [FIRST]: FIRST_SQL });
  t.after(() => dir.remove());
  const options = { connectionString: db.connectionString, migrationsDir: dir.path, log: quiet };

  await migrate(options);
  const before = await schemaMigrations(db.connectionString);
  await dir.write({ [FIRST]: toCrlf(FIRST_SQL) });

  const result = await migrate(options);

  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped, [FIRST]);
  assert.deepEqual(await schemaMigrations(db.connectionString), before);
});
