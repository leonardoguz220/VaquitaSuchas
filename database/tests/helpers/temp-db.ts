// Bases temporales para pruebas que necesitan una base vacía y aislada (research R7).
// Se crean desde la conexión de pruebas (testDatabaseUrl) y se borran con DROP ... WITH (FORCE).
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl } from '../../src/config.ts';

export interface TempDatabase {
  readonly name: string;
  readonly connectionString: string;
  drop(): Promise<void>;
}

async function withAdminClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Un pool por base: abrir una conexión por consulta domina el tiempo de la suite. allowExitOnIdle
// deja terminar el proceso de prueba y el manejador de 'error' absorbe las conexiones ociosas que
// corta un DROP DATABASE ... WITH (FORCE).
const pools = new Map<string, pg.Pool>();

function poolFor(connectionString: string): pg.Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 1000,
      allowExitOnIdle: true,
    });
    pool.on('error', () => undefined);
    pools.set(connectionString, pool);
  }
  return pool;
}

async function closePool(connectionString: string): Promise<void> {
  const pool = pools.get(connectionString);
  pools.delete(connectionString);
  await pool?.end();
}

export async function createTempDatabase(): Promise<TempDatabase> {
  const name = `vaquita_t_${randomBytes(6).toString('hex')}`;
  await withAdminClient((client) => client.query(`CREATE DATABASE "${name}"`));

  const url = new URL(testDatabaseUrl());
  url.pathname = `/${name}`;

  return {
    name,
    connectionString: url.toString(),
    drop: async () => {
      await closePool(url.toString());
      await withAdminClient(async (client) => {
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      });
    },
  };
}

export async function queryRows<T extends pg.QueryResultRow>(
  connectionString: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await poolFor(connectionString).query<T>(sql, params);
  return rows;
}

export interface MigrationRow {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
}

export function schemaMigrations(connectionString: string): Promise<MigrationRow[]> {
  return queryRows<MigrationRow>(
    connectionString,
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version',
  );
}

export async function tableExists(connectionString: string, table: string): Promise<boolean> {
  const rows = await queryRows<{ exists: boolean }>(
    connectionString,
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return rows[0]?.exists === true;
}

// Foto del esquema público (tablas y columnas) para comparar antes y después de una ejecución.
export async function schemaSnapshot(connectionString: string): Promise<string[]> {
  const rows = await queryRows<{ line: string }>(
    connectionString,
    `SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS line
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  );
  return rows.map((row) => row.line);
}
