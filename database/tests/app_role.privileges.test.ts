// RF-000-07 / RNF-000-02 (T033, plan.md §Privilegios de la base): el backend se conecta con un rol
// de aplicación que solo hace DML. No puede borrar ni alterar tablas ni crear extensiones, pero sí
// puede ejecutar la limpieza de maintenance.cleanup. Los permisos son los de database/README.md §8.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testDatabaseUrl } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const INSUFFICIENT_PRIVILEGE = '42501';
const RESTRICT_VIOLATION = '23001';
const quiet = (): void => undefined;

let db: TempDatabase;
let owner: pg.Client;
let app: pg.Client;
const role = `vaquita_app_${randomBytes(4).toString('hex')}`;
const password = randomBytes(8).toString('hex');

before(async () => {
  db = await createTempDatabase();
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    log: quiet,
  });
  owner = new pg.Client({ connectionString: db.connectionString });
  await owner.connect();
  await owner.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  await owner.query(`GRANT CONNECT ON DATABASE "${db.name}" TO ${role}`);
  await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await owner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
  );
  await owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);

  const url = new URL(db.connectionString);
  url.username = role;
  url.password = password;
  app = new pg.Client({ connectionString: url.toString() });
  await app.connect();
});

after(async () => {
  await app?.end();
  await owner?.end();
  await db?.drop();
  // Los roles son del servidor, no de la base temporal: se borran aparte.
  const cleaner = new pg.Client({ connectionString: testDatabaseUrl() });
  await cleaner.connect();
  try {
    await cleaner.query(`DROP ROLE IF EXISTS ${role}`);
  } finally {
    await cleaner.end();
  }
});

async function code(sql: string): Promise<string | undefined> {
  try {
    await app.query(sql);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test('RNF-000-02: el rol de aplicación no puede borrar ni alterar tablas ni crear objetos', async () => {
  assert.equal(await code('DROP TABLE job_runs'), INSUFFICIENT_PRIVILEGE);
  assert.equal(await code('ALTER TABLE job_runs ADD COLUMN x int'), INSUFFICIENT_PRIVILEGE);
  assert.equal(await code('CREATE TABLE intruso (id int)'), INSUFFICIENT_PRIVILEGE);
  assert.equal(await code('TRUNCATE rate_limit_events'), INSUFFICIENT_PRIVILEGE);
});

test('RNF-000-02: el rol de aplicación no puede crear extensiones', async () => {
  assert.equal(await code('CREATE EXTENSION IF NOT EXISTS pgcrypto'), INSUFFICIENT_PRIVILEGE);
  assert.equal(await code('CREATE EXTENSION hstore'), INSUFFICIENT_PRIVILEGE);
});

test('T033: con el rol de aplicación la limpieza borra lo viejo de rate_limit_events y telegram_updates, y no lo reciente', async () => {
  await app.query(
    `INSERT INTO rate_limit_events (bucket, key_hash, occurred_at) VALUES
       ('login_fail:ip', 'old', now() - interval '25 hours'),
       ('login_fail:ip', 'recent', now() - interval '1 hour')`,
  );
  await app.query(
    `INSERT INTO telegram_updates (update_id, received_at) VALUES
       (1, now() - interval '8 days'), (2, now())`,
  );

  const limits = await app.query(
    `DELETE FROM rate_limit_events WHERE occurred_at < now() - interval '24 hours'`,
  );
  const updates = await app.query(
    `DELETE FROM telegram_updates WHERE received_at < now() - interval '7 days'`,
  );
  assert.equal(limits.rowCount, 1);
  assert.equal(updates.rowCount, 1);

  assert.equal(
    await code(`DELETE FROM rate_limit_events WHERE key_hash = 'recent'`),
    RESTRICT_VIOLATION,
  );
});
