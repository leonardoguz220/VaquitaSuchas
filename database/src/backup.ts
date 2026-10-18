// Respaldo y restauración (spec 000, plan §3 "Respaldo", riesgo R-01): envoltorios de pg_dump y
// psql. Usa los binarios del PATH; si no están y la base es local, recurre a los del contenedor
// `db` de docker-compose (`docker compose exec -T db ...`). Sin shell y sin imprimir la cadena de
// conexión: la contraseña viaja en PGPASSWORD.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connectionParts, databaseHost, isLocalDatabaseUrl, libpqEnv } from './cli-support.ts';

export type BackupRunner = 'native' | 'docker';
export type RunnerChoice = BackupRunner | 'auto';

export interface DumpOptions {
  connectionString: string;
  file: string;
  runner?: RunnerChoice;
}

export interface RestoreOptions {
  connectionString: string;
  file: string;
  allowRemote?: boolean;
  runner?: RunnerChoice;
}

export interface BackupResult {
  file: string;
  runner: BackupRunner;
}

export class BackupToolMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupToolMissingError';
  }
}

// Texto plano, sin dueños ni privilegios (la base de destino puede tener otro usuario) y con
// DROP ... IF EXISTS previo, para restaurar sobre una base vacía o sobre una ya migrada.
const DUMP_FLAGS = ['--format=plain', '--no-owner', '--no-privileges', '--clean', '--if-exists'];
// Todo o nada: se detiene en el primer error y revierte la transacción completa.
const RESTORE_FLAGS = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction'];
const QUIET_NOTICES = '-c client_min_messages=warning';

const repoRoot = (): string => fileURLToPath(new URL('../../', import.meta.url));

export function defaultDumpFile(now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
  return path.join('backups', `vaquita-${stamp}.sql`);
}

interface SpawnSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdin?: string;
  stdoutFile?: string;
}

class CommandNotFound extends Error {}

// Marca la promesa como observada (si el proceso no llega a cerrar no queda un rechazo suelto)
// y la devuelve tal cual para esperarla después.
function settled<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

// Ejecuta sin shell. stderr se guarda para el mensaje de error; libpq no incluye la contraseña.
function run(spec: SpawnSpec): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      env: spec.env ?? process.env,
      cwd: spec.cwd,
      shell: false,
      windowsHide: true,
      stdio: [
        spec.stdin !== undefined ? 'pipe' : 'ignore',
        spec.stdoutFile ? 'pipe' : 'ignore',
        'pipe',
      ],
    });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const transfers: Promise<void>[] = [];
    if (spec.stdin !== undefined && child.stdin) {
      transfers.push(settled(pipeline(Readable.from([spec.stdin]), child.stdin)));
    }
    if (spec.stdoutFile && child.stdout) {
      transfers.push(settled(pipeline(child.stdout, createWriteStream(spec.stdoutFile))));
    }

    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new CommandNotFound(spec.command) : error);
    });
    child.on('close', (code) => {
      // Si el proceso falla, su stderr explica mejor que el EPIPE de la tubería de entrada.
      if (code !== 0) {
        reject(new Error(`${spec.command} terminó con código ${code}: ${stderr.trim()}`));
        return;
      }
      Promise.all(transfers).then(() => resolve(), reject);
    });
  });
}

async function withRunner(
  connectionString: string,
  choice: RunnerChoice,
  native: () => Promise<void>,
  docker: () => Promise<void>,
  tool: string,
): Promise<BackupRunner> {
  if (choice === 'docker') {
    await docker();
    return 'docker';
  }
  try {
    await native();
    return 'native';
  } catch (error) {
    if (!(error instanceof CommandNotFound) || choice === 'native') {
      if (error instanceof CommandNotFound) {
        throw new BackupToolMissingError(`No se encontró ${tool} en el PATH.`);
      }
      throw error;
    }
  }
  if (!isLocalDatabaseUrl(connectionString)) {
    throw new BackupToolMissingError(
      `No se encontró ${tool} en el PATH y la base no es local, así que no se usa el ` +
        'contenedor de docker-compose. Instala el cliente de PostgreSQL.',
    );
  }
  try {
    await docker();
  } catch (error) {
    if (error instanceof CommandNotFound) {
      throw new BackupToolMissingError(
        `No se encontró ${tool} ni docker en el PATH. Instala el cliente de PostgreSQL ` +
          'o levanta la base con `npm run db:up`.',
      );
    }
    throw error;
  }
  return 'docker';
}

function dockerArgs(connectionString: string, tool: string, extra: string[]): string[] {
  const parts = connectionParts(connectionString);
  // Dentro del contenedor se conecta por el socket local (autenticación trust de la imagen).
  return [
    'compose',
    'exec',
    '-T',
    '-e',
    `PGOPTIONS=${QUIET_NOTICES}`,
    'db',
    tool,
    '-U',
    parts.user || 'postgres',
    '-d',
    parts.database || parts.user || 'postgres',
    ...extra,
  ];
}

export async function dump(options: DumpOptions): Promise<BackupResult> {
  const file = path.resolve(options.file);
  await mkdir(path.dirname(file), { recursive: true });
  const runner = await withRunner(
    options.connectionString,
    options.runner ?? 'auto',
    () =>
      run({
        command: 'pg_dump',
        args: [...DUMP_FLAGS, `--file=${file}`],
        env: libpqEnv(options.connectionString),
      }),
    () =>
      run({
        command: 'docker',
        args: dockerArgs(options.connectionString, 'pg_dump', DUMP_FLAGS),
        cwd: repoRoot(),
        stdoutFile: file,
      }),
    'pg_dump',
  );
  return { file, runner };
}

export class RestoreRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreRefusedError';
  }
}

export function assertRestoreAllowed(connectionString: string, allowRemote: boolean): void {
  if (allowRemote || isLocalDatabaseUrl(connectionString)) return;
  throw new RestoreRefusedError(
    `db:restore reemplaza los datos de la base y la URL apunta a "${databaseHost(connectionString)}", ` +
      'que no es local. Una persona del equipo restaura staging a mano pasando --allow-remote.',
  );
}

export async function restore(options: RestoreOptions): Promise<BackupResult> {
  assertRestoreAllowed(options.connectionString, options.allowRemote === true);
  const file = path.resolve(options.file);
  const raw = await readFile(file, 'utf8').catch(() => {
    throw new Error(`No existe o no se puede leer el archivo de respaldo ${file}.`);
  });
  const sql = adaptDumpToServer(raw, await serverVersionNum(options.connectionString));
  const env = { ...libpqEnv(options.connectionString), PGOPTIONS: QUIET_NOTICES };
  const args = [...RESTORE_FLAGS, '-f', '-'];
  const runner = await withRunner(
    options.connectionString,
    options.runner ?? 'auto',
    () => run({ command: 'psql', args, env, stdin: sql }),
    () =>
      run({
        command: 'docker',
        args: dockerArgs(options.connectionString, 'psql', args),
        cwd: repoRoot(),
        stdin: sql,
      }),
    'psql',
  );
  return { file, runner };
}

async function serverVersionNum(connectionString: string): Promise<number> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ v: string }>('SHOW server_version_num');
    return Number(rows[0]?.v);
  } finally {
    await client.end().catch(() => undefined);
  }
}

// pg_dump 17 o posterior escribe `SET transaction_timeout = 0;` aunque la base de origen sea más
// antigua, y PostgreSQL 16 (el de docker-compose) rechaza ese parámetro. Si el destino es anterior
// a 17 se quita solo esa línea; el resto del respaldo no se toca.
export function adaptDumpToServer(sql: string, serverVersion: number): string {
  if (serverVersion >= 170000) return sql;
  return sql.replace(/^SET transaction_timeout = 0;\r?\n/m, '');
}
