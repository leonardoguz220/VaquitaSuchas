// Reset de la base local (spec 000, RF-000-06): borra el esquema public, lo recrea, aplica las
// migraciones y siembra. Solo contra la base local: se niega con un host remoto o en producción.
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  databaseHost,
  errorMessage,
  isInvokedDirectly,
  isLocalDatabaseUrl,
  resolveConnectionString,
} from './cli-support.ts';
import { migrate, type MigrateResult } from './migrate.ts';
import { defaultSeedsDir, seed, type SeedResult } from './seed.ts';

export interface ResetOptions {
  connectionString: string;
  migrationsDir: string;
  seedsDir: string;
  log?: (line: string) => void;
}

export interface ResetResult {
  migrations: MigrateResult;
  seeds: SeedResult;
}

export class ResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetRefusedError';
  }
}

// Comprueba que el reset es seguro sin conectarse a la base.
export function assertResetAllowed(connectionString: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new ResetRefusedError('db:reset no se ejecuta con NODE_ENV=production.');
  }
  if (!isLocalDatabaseUrl(connectionString)) {
    throw new ResetRefusedError(
      `db:reset solo recrea la base local y la URL apunta a "${databaseHost(connectionString)}". ` +
        'Los hosts permitidos son localhost, 127.0.0.1, ::1, db y postgres.',
    );
  }
}

// Recrea public como lo deja PostgreSQL 15+: dueño pg_database_owner y USAGE para PUBLIC.
// La extensión unaccent vivía en public y cae con el CASCADE; la vuelve a crear 0001_init.sql.
const RECREATE_PUBLIC_SQL = `
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public AUTHORIZATION pg_database_owner;
  GRANT USAGE ON SCHEMA public TO PUBLIC;
  COMMENT ON SCHEMA public IS 'standard public schema';
`;

export async function reset(options: ResetOptions): Promise<ResetResult> {
  assertResetAllowed(options.connectionString);
  const log = options.log ?? (() => undefined);

  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(RECREATE_PUBLIC_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
  log('Esquema public recreado');

  const migrations = await migrate({
    connectionString: options.connectionString,
    migrationsDir: options.migrationsDir,
    log,
  });
  const seeds = await seed({
    connectionString: options.connectionString,
    seedsDir: options.seedsDir,
    log,
  });
  return { migrations, seeds };
}

async function main(): Promise<void> {
  try {
    const result = await reset({
      connectionString: resolveConnectionString(),
      migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
      seedsDir: defaultSeedsDir(),
      log: (line) => process.stdout.write(`${line}\n`),
    });
    process.stdout.write(
      `Reset: ${result.migrations.applied.length} migraciones y ` +
        `${result.seeds.applied.length} seeds aplicados.\n`,
    );
  } catch (error) {
    process.stderr.write(`Error en db:reset: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (isInvokedDirectly(import.meta.url)) {
  await main();
}
