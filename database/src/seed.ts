// Seed de Vaquita (spec 000, RF-000-06; RF-009-02). Ejecuta database/seeds/NNNN_nombre.sql en
// orden numérico dentro de una sola transacción: si un archivo falla no queda nada sembrado.
// Después, en la misma transacción, aplica database/seeds/catalog.json si existe (spec 004,
// RF-004-07, RNF-004-03): se valida entero con validateCatalog antes de conectarse.
// Los archivos son idempotentes (INSERT ... ON CONFLICT) y nunca llevan contraseñas: el
// administrador de desarrollo lo crea `npm run seed:admin -w backend` (spec 000, T027).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { errorMessage, isInvokedDirectly, resolveConnectionString } from './cli-support.ts';
import {
  CatalogValidationError,
  validateCatalog,
  writeCatalog,
  type CatalogCounts,
  type CatalogData,
} from './seed-catalog.ts';

export interface SeedOptions {
  connectionString: string;
  seedsDir: string;
  log?: (line: string) => void;
}

export interface SeedResult {
  applied: string[];
  // null cuando no hay seeds/catalog.json.
  catalog: CatalogCounts | null;
}

export const CATALOG_FILE = 'catalog.json';

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

// Lee y valida seeds/catalog.json. Devuelve null si no existe; cualquier problema es un SeedError.
async function readCatalog(seedsDir: string): Promise<CatalogData | null> {
  let text: string;
  try {
    text = await readFile(path.join(seedsDir, CATALOG_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  // JSON no tiene comentarios: la regla de contraseñas mira el texto completo (RF-009-02).
  if (/password/i.test(text)) {
    throw new SeedError(
      CATALOG_FILE,
      `El archivo ${CATALOG_FILE} menciona una contraseña. El catálogo no lleva contraseñas (RF-009-02).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SeedError(
      CATALOG_FILE,
      `${CATALOG_FILE} no es JSON válido: ${errorMessage(error)}`,
      error,
    );
  }
  try {
    return validateCatalog(parsed);
  } catch (error) {
    if (!(error instanceof CatalogValidationError)) throw error;
    throw new SeedError(
      CATALOG_FILE,
      `${CATALOG_FILE} no es válido y no se sembró nada:\n- ${error.problems.join('\n- ')}`,
      error,
    );
  }
}

export async function seed(options: SeedOptions): Promise<SeedResult> {
  const log = options.log ?? (() => undefined);
  // Se leen y validan todos los archivos antes de conectarse: un seed rechazado no ejecuta nada.
  const files = await readSeeds(options.seedsDir);
  const catalogData = await readCatalog(options.seedsDir);

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
    let catalog: CatalogCounts | null = null;
    if (catalogData) {
      current = CATALOG_FILE;
      catalog = await writeCatalog(client, catalogData);
      log(`Sembrado ${CATALOG_FILE}: ${catalog.services} servicios, ${catalog.plans} planes`);
    }
    current = null;
    await client.query('COMMIT');
    return { applied: files.map((file) => file.name), catalog };
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
    const catalog = result.catalog
      ? `${result.catalog.services} servicios, ${result.catalog.plans} planes`
      : 'sin catalog.json';
    process.stdout.write(
      `Seed: ${result.applied.length} archivos aplicados; catálogo: ${catalog}.\n`,
    );
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
