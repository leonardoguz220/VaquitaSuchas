// Seed de Vaquita (spec 000, RF-000-06; RF-009-02). Ejecuta database/seeds/NNNN_nombre.sql en
// orden numérico dentro de una sola transacción: si un archivo falla no queda nada sembrado.
// Los archivos son idempotentes (INSERT ... ON CONFLICT) y nunca llevan contraseñas: el
// administrador de desarrollo lo crea `npm run seed:admin -w backend` (spec 000, T027).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { errorMessage, isInvokedDirectly, resolveConnectionString } from './cli-support.ts';

export interface SeedOptions {
  connectionString: string;
  seedsDir: string;
  log?: (line: string) => void;
}

export interface SeedResult {
  applied: string[];
}

export class SeedError extends Error {
  readonly file: string;

  constructor(file: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'SeedError';
    this.file = file;
  }
}

const SEED_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

interface SeedFile {
  name: string;
  sql: string;
}

// Quita comentarios `-- ...` y `/* ... */` para que la regla de contraseñas mire solo el SQL.
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

// RF-009-02: ningún seed menciona contraseñas (password, password_hash, ...) fuera de comentarios.
export function mentionsPassword(sql: string): boolean {
  return /password/i.test(stripSqlComments(sql));
}

async function readSeeds(seedsDir: string): Promise<SeedFile[]> {
  const entries = await readdir(seedsDir);
  const byNumber = new Map<string, string>();
  for (const name of entries) {
    const match = SEED_FILE.exec(name);
    if (!match) continue;
    const number = match[1] as string;
    const existing = byNumber.get(number);
    if (existing) {
      throw new SeedError(
        name,
        `Dos seeds usan el prefijo ${number}: ${existing} y ${name}. Renumera uno de ellos.`,
      );
    }
    byNumber.set(number, name);
  }

  const files: SeedFile[] = [];
  for (const number of [...byNumber.keys()].sort()) {
    const name = byNumber.get(number) as string;
    const sql = await readFile(path.join(seedsDir, name), 'utf8');
    if (mentionsPassword(sql)) {
      throw new SeedError(
        name,
        `El seed ${name} menciona una contraseña. El repositorio no guarda contraseñas: el ` +
          'administrador de desarrollo se crea con `npm run seed:admin -w backend` (RF-009-02).',
      );
    }
    files.push({ name, sql });
  }
  return files;
}

export async function seed(options: SeedOptions): Promise<SeedResult> {
  const log = options.log ?? (() => undefined);
  // Se leen y validan todos los archivos antes de conectarse: un seed rechazado no ejecuta nada.
  const files = await readSeeds(options.seedsDir);

  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  let current: string | null = null;
  try {
    await client.query('BEGIN');
    for (const file of files) {
      current = file.name;
      await client.query(file.sql);
      log(`Sembrado ${file.name}`);
    }
    current = null;
    await client.query('COMMIT');
    return { applied: files.map((file) => file.name) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (current === null) throw error;
    throw new SeedError(
      current,
      `El seed ${current} falló y no se sembró nada: ${errorMessage(error)}`,
      error,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

export const defaultSeedsDir = (): string => fileURLToPath(new URL('../seeds/', import.meta.url));

async function main(): Promise<void> {
  try {
    const result = await seed({
      connectionString: resolveConnectionString(),
      seedsDir: defaultSeedsDir(),
      log: (line) => process.stdout.write(`${line}\n`),
    });
    process.stdout.write(`Seed: ${result.applied.length} archivos aplicados.\n`);
  } catch (error) {
    if (error instanceof SeedError) {
      process.stderr.write(`Error en ${error.file}: ${error.message}\n`);
    } else {
      process.stderr.write(`Error al sembrar: ${errorMessage(error)}\n`);
    }
    process.exitCode = 1;
  }
}

if (isInvokedDirectly(import.meta.url)) {
  await main();
}
