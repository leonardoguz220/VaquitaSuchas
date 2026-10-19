// Ejecutor de migraciones de Vaquita (spec 000, research R6; RF-000-05, RN-000-02, RN-000-03).
// Aplica database/migrations/NNNN_nombre.sql en orden, una transacción por archivo, bajo un
// bloqueo asesor, y se niega a continuar si una migración ya aplicada cambió de contenido.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl } from './config.ts';

export interface MigrateOptions {
  connectionString: string;
  migrationsDir: string;
  log?: (line: string) => void;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export class MigrationError extends Error {
  readonly file: string;

  constructor(file: string, cause: unknown) {
    super(`La migración ${file} falló: ${errorMessage(cause)}`, { cause });
    this.name = 'MigrationError';
    this.file = file;
  }
}

export class MigrationChecksumError extends Error {
  readonly file: string;

  constructor(file: string, detail: string) {
    super(
      `La migración ${file} ya está aplicada y ${detail}. ` +
        'Una migración aplicada no se edita: crea una migración nueva (RN-000-02).',
    );
    this.name = 'MigrationChecksumError';
    this.file = file;
  }
}

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const LOCK_KEY_SQL = "hashtext('vaquita.migrate')";

interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

interface AppliedRow {
  version: string;
  name: string;
  checksum: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function checksumOf(content: string): string {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

async function readMigrations(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir);
  const byVersion = new Map<string, string>();
  for (const name of entries) {
    const match = MIGRATION_FILE.exec(name);
    if (!match) continue;
    const version = match[1] as string;
    const existing = byVersion.get(version);
    if (existing) {
      throw new Error(
        `Dos migraciones usan el prefijo ${version}: ${existing} y ${name}. Renumera una de ellas.`,
      );
    }
    byVersion.set(version, name);
  }

  const versions = [...byVersion.keys()].sort();
  const files: MigrationFile[] = [];
  for (const version of versions) {
    const name = byVersion.get(version) as string;
    const sql = await readFile(path.join(migrationsDir, name), 'utf8');
    files.push({ version, name, sql, checksum: checksumOf(sql) });
  }
  return files;
}

function verifyApplied(files: MigrationFile[], applied: Map<string, AppliedRow>): void {
  for (const file of files) {
    const row = applied.get(file.version);
    if (!row) continue;
    if (row.name !== file.name) {
      throw new MigrationChecksumError(
        row.name,
        `en el disco aparece renombrada como ${file.name}`,
      );
    }
    if (row.checksum !== file.checksum) {
      throw new MigrationChecksumError(file.name, 'su contenido cambió (el checksum no coincide)');
    }
  }
}

async function applyOne(client: pg.Client, file: MigrationFile): Promise<void> {
  try {
    await client.query('BEGIN');
    await client.query(file.sql);
    await client.query(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
      [file.version, file.name, file.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new MigrationError(file.name, error);
  }
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const log = options.log ?? (() => undefined);
  const files = await readMigrations(options.migrationsDir);

  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  let locked = false;
  try {
    await client.query(`SELECT pg_advisory_lock(${LOCK_KEY_SQL})`);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text        PRIMARY KEY,
        name       text        NOT NULL,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<AppliedRow>(
      'SELECT version, name, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((row) => [row.version, row]));

    verifyApplied(files, applied);

    const result: MigrateResult = { applied: [], skipped: [] };
    for (const file of files) {
      if (applied.has(file.version)) {
        result.skipped.push(file.name);
        continue;
      }
      await applyOne(client, file);
      result.applied.push(file.name);
      log(`Aplicada ${file.name}`);
    }
    return result;
  } finally {
    if (locked) {
      await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY_SQL})`).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

function resolveConnectionString(): string {
  const strict = process.env.CI === 'true' || process.env.NODE_ENV === 'production';
  if (strict && !process.env.DATABASE_URL) {
    throw new Error(
      'Falta DATABASE_URL: en CI y en producción no se usa la base local por defecto.',
    );
  }
  return databaseUrl();
}

async function main(): Promise<void> {
  const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
  try {
    const result = await migrate({
      connectionString: resolveConnectionString(),
      migrationsDir,
      log: (line) => process.stdout.write(`${line}\n`),
    });
    process.stdout.write(
      `Migraciones: ${result.applied.length} aplicadas, ${result.skipped.length} ya estaban aplicadas.\n`,
    );
  } catch (error) {
    if (error instanceof MigrationError || error instanceof MigrationChecksumError) {
      process.stderr.write(`Error en ${error.file}: ${error.message}\n`);
    } else {
      process.stderr.write(`Error al migrar: ${errorMessage(error)}\n`);
    }
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
