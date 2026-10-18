// Verificación de migraciones para CI, `db:check` (spec 000, research R6, data-model.md §4
// `numbering.check`; RN-000-02 y spec 000 §8 "Dos integrantes crean migraciones con el mismo
// número"). Comprueba que los nombres de database/migrations/ sigan NNNN_nombre.sql con prefijos
// únicos y que ninguna migración que ya existe en la rama base (por defecto origin/main) haya sido
// editada ni borrada en el disco. No se conecta a ninguna base de datos.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { checksumOf } from './migrate.ts';

const execFileAsync = promisify(execFile);

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const PREFIX = /^(\d{4})_/;
const MIGRATIONS_PATH = 'database/migrations';
const DEFAULT_BASE = 'origin/main';

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String((error as { stderr: unknown }).stderr).trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

function isSqlFile(name: string): boolean {
  return path.extname(name).toLowerCase() === '.sql';
}

// Problemas de numeración en una lista de nombres de archivo. Ignora lo que no es .sql (.gitkeep).
export function checkNumbering(fileNames: string[]): string[] {
  const problems: string[] = [];
  const byPrefix = new Map<string, string[]>();

  for (const name of [...fileNames].sort()) {
    if (!isSqlFile(name)) continue;
    if (!MIGRATION_NAME.test(name)) {
      problems.push(
        `${name}: el nombre no cumple NNNN_nombre.sql (4 dígitos, guion bajo, minúsculas, números y _).`,
      );
    }
    const prefix = PREFIX.exec(name)?.[1];
    if (prefix) byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }

  for (const [prefix, names] of byPrefix) {
    if (names.length > 1) {
      problems.push(
        `El prefijo ${prefix} está repetido en ${names.join(', ')}. Renumera una de ellas dentro del rango de su spec.`,
      );
    }
  }
  return problems;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Migraciones que existen en baseRef y que en el disco cambiaron de contenido o desaparecieron.
// Compara con checksumOf, que normaliza CRLF a LF: un cambio solo de fin de línea no cuenta.
// cwd puede ser cualquier carpeta dentro del repositorio. Nunca lanza: los fallos de git se
// devuelven como problema.
export async function checkUnchanged(baseRef: string, cwd: string): Promise<string[]> {
  if (!baseRef || baseRef.startsWith('-')) {
    return [`La referencia base "${baseRef}" no es válida.`];
  }

  let root: string;
  try {
    root = (await git(['rev-parse', '--show-toplevel'], cwd)).trim();
  } catch (error) {
    return [`No se pudo ubicar el repositorio git desde ${cwd}: ${errorMessage(error)}`];
  }

  try {
    await git(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`], root);
  } catch {
    return [
      `La referencia base ${baseRef} no existe. En CI hay que traerla antes (por ejemplo, git fetch origin main).`,
    ];
  }

  let listed: string[];
  try {
    const out = await git(['ls-tree', '--name-only', baseRef, `${MIGRATIONS_PATH}/`], root);
    listed = out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && isSqlFile(line));
  } catch (error) {
    return [`No se pudo listar ${MIGRATIONS_PATH} en ${baseRef}: ${errorMessage(error)}`];
  }

  const problems: string[] = [];
  for (const file of listed) {
    const name = path.posix.basename(file);
    try {
      const base = await git(['show', `${baseRef}:${file}`], root);
      const current = await readIfExists(path.join(root, file));
      if (current === null) {
        problems.push(
          `${name} existe en ${baseRef} y fue borrada. Una migración fusionada no se borra (RN-000-02).`,
        );
      } else if (checksumOf(current) !== checksumOf(base)) {
        problems.push(
          `${name} fue editada respecto de ${baseRef}. Una migración fusionada no se edita: crea una nueva (RN-000-02).`,
        );
      }
    } catch (error) {
      problems.push(`No se pudo comparar ${name} con ${baseRef}: ${errorMessage(error)}`);
    }
  }
  return problems;
}

export function resolveBase(argv: string[], env: NodeJS.ProcessEnv): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--base') return argv[i + 1] ?? '';
    if (arg.startsWith('--base=')) return arg.slice('--base='.length);
  }
  return env.DB_CHECK_BASE || DEFAULT_BASE;
}

async function main(): Promise<void> {
  const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const base = resolveBase(process.argv.slice(2), process.env);

  const problems = [
    ...checkNumbering(await readdir(migrationsDir)),
    ...(await checkUnchanged(base, migrationsDir)),
  ];

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`db:check: ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`db:check: numeración correcta y ninguna migración de ${base} cambió.\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
