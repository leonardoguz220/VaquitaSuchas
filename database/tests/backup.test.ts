// Spec 000, plan §3 "Respaldo" (RF-000-06, riesgo R-01): `db:dump` y `db:restore` llevan una base
// migrada con datos a otra base, en todo o nada, y restore se niega contra hosts no locales.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  adaptDumpToServer,
  dump,
  restore,
  RestoreRefusedError,
  type RunnerChoice,
} from '../src/backup.ts';
import { testDatabaseUrl } from '../src/config.ts';
import { isLocalDatabaseUrl } from '../src/cli-support.ts';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, schemaMigrations } from './helpers/temp-db.ts';

const quiet = (): void => undefined;
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// Sale con 0 y, si se pide, imprime algo (docker compose ps --quiet imprime el id si está en marcha).
function succeeds(command: string, args: string[], needsOutput = false): boolean {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return false;
  return !needsOutput || (result.stdout ?? '').trim() !== '';
}

const hasNativeTools = succeeds('pg_dump', ['--version']) && succeeds('psql', ['--version']);
// El respaldo por docker solo sirve si la base de pruebas es la del contenedor `db` local.
const hasDockerDb =
  isLocalDatabaseUrl(testDatabaseUrl()) &&
  succeeds('docker', ['compose', 'ps', '--status', 'running', '--quiet', 'db'], true);

async function tempDir(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vaquita-backup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function roundTrip(t: test.TestContext, runner: RunnerChoice): Promise<void> {
  const source = await createTempDatabase();
  t.after(() => source.drop());
  const target = await createTempDatabase();
  t.after(() => target.drop());
  await migrate({ connectionString: source.connectionString, migrationsDir, log: quiet });
  await queryRows(source.connectionString, 'INSERT INTO telegram_updates (update_id) VALUES (7)');

  const file = path.join(await tempDir(t), 'nested', 'dump.sql');
  const dumped = await dump({ connectionString: source.connectionString, file, runner });
  const sql = await readFile(dumped.file, 'utf8');
  assert.doesNotMatch(sql, /OWNER TO|GRANT /, 'el respaldo va sin dueños ni privilegios');

  // Primero sobre una base vacía y después otra vez encima (el respaldo trae DROP ... IF EXISTS).
  for (let round = 0; round < 2; round += 1) {
    await restore({ connectionString: target.connectionString, file: dumped.file, runner });
    const rows = await queryRows<{ update_id: string }>(
      target.connectionString,
      'SELECT update_id FROM telegram_updates',
    );
    assert.deepEqual(rows, [{ update_id: '7' }]);
  }
  const restored = await schemaMigrations(target.connectionString);
  const original = await schemaMigrations(source.connectionString);
  assert.deepEqual(
    restored.map((row) => [row.name, row.checksum]),
    original.map((row) => [row.name, row.checksum]),
  );
  const unaccented = await queryRows<{ v: string }>(
    target.connectionString,
    "SELECT immutable_unaccent('Acción') AS v",
  );
  assert.deepEqual(unaccented, [{ v: 'Accion' }]);
}

test(
  'RF-000-06: db:dump y db:restore llevan una base migrada con datos a otra base (pg_dump o docker)',
  {
    skip:
      hasNativeTools || hasDockerDb
        ? false
        : 'No hay pg_dump/psql en el PATH ni el contenedor db de docker-compose en marcha.',
  },
  (t) => roundTrip(t, 'auto'),
);

test(
  'RF-000-06: el respaldo con pg_dump y psql del contenedor db funciona sin cliente local',
  {
    skip: hasDockerDb ? false : 'El contenedor db de docker-compose no está en marcha.',
  },
  (t) => roundTrip(t, 'docker'),
);

test(
  'RF-000-06: un restore fallido no deja nada a medias',
  {
    skip: hasNativeTools || hasDockerDb ? false : 'No hay psql en el PATH ni el contenedor db.',
  },
  async (t) => {
    const target = await createTempDatabase();
    t.after(() => target.drop());
    const dir = await tempDir(t);
    const file = path.join(dir, 'broken.sql');
    await writeFile(
      file,
      'CREATE TABLE kept (id integer);\nSELECT * FROM missing_table;\n',
      'utf8',
    );

    await assert.rejects(restore({ connectionString: target.connectionString, file }));
    const rows = await queryRows(
      target.connectionString,
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'kept'",
    );
    assert.deepEqual(rows, []);
  },
);

test('RF-000-06: restore se niega contra un host no local salvo con allowRemote', async (t) => {
  const file = path.join(await tempDir(t), 'none.sql');
  await assert.rejects(
    restore({ connectionString: 'postgres://u:p@staging.example.com/db', file }),
    (error: unknown) => {
      assert.ok(error instanceof RestoreRefusedError);
      assert.match(error.message, /--allow-remote/);
      assert.doesNotMatch(error.message, /u:p@/);
      return true;
    },
  );
  // Con allowRemote pasa la política y se detiene en el archivo inexistente, antes de conectarse.
  await assert.rejects(
    restore({ connectionString: 'postgres://u:p@staging.example.com/db', file, allowRemote: true }),
    /No existe o no se puede leer el archivo/,
  );
});

test('RF-000-06: el respaldo de pg_dump 17+ se adapta a un destino PostgreSQL 16', () => {
  const sql = [
    'SET statement_timeout = 0;',
    'SET transaction_timeout = 0;',
    'SET lock_timeout = 0;',
    '',
  ].join('\n');
  assert.equal(
    adaptDumpToServer(sql, 160010),
    ['SET statement_timeout = 0;', 'SET lock_timeout = 0;', ''].join('\n'),
  );
  assert.equal(adaptDumpToServer(sql, 170000), sql);
});
