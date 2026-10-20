// PostToolUse (Edit, Write, MultiEdit). Después de editar código de backend/, frontend/ o database/:
// 1. formatea el archivo con Prettier, si ya está instalado;
// 2. solo con VAQUITA_HOOK_TESTS=1, corre los tests unitarios relacionados (Jest o Vitest) y, si fallan, se lo devuelve a Claude.
// Los tests están apagados por defecto: correrlos en cada edición choca con escribir el test antes que el código
// (el test recién escrito falla y bloquea cada paso) y gasta muchos tokens. Ya los corren el hook de pre-push y la CI.
// No hace nada mientras no exista el código (antes de T001, T004 y T005).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readInput, relPath, isInsideRepo } from './lib.mjs';

const input = await readInput();
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = relPath(filePath);
const match = rel.match(/^(backend|frontend|database)\/(.+)$/);
if (!isInsideRepo(rel) || !match || rel.includes('/node_modules/')) process.exit(0);

const workspace = match[1];
const abs = path.join(ROOT, rel);
if (!existsSync(abs)) process.exit(0);

// Busca un ejecutable de un paquete en el workspace o en la raíz (npm workspaces lo eleva a la raíz).
function findBin(...candidates) {
  for (const dir of [path.join(ROOT, workspace), ROOT]) {
    for (const candidate of candidates) {
      const full = path.join(dir, 'node_modules', candidate);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function run(bin, args, cwd, nodeArgs = []) {
  execFileSync(process.execPath, [...nodeArgs, bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
}

if (/\.(ts|tsx|js|mjs|cjs|json|css|md)$/.test(rel)) {
  const prettier = findBin('prettier/bin/prettier.cjs');
  if (prettier) {
    try {
      run(prettier, ['--write', '--log-level', 'warn', abs], ROOT);
    } catch {
      // Un error de sintaxis lo reporta el lint o el test; el formateo no bloquea.
    }
  }
}

const isCode = /\.(ts|tsx)$/.test(rel);
// Las pruebas de database/ y las e2e necesitan PostgreSQL: las corre CI, no este hook.
if (!isCode || workspace === 'database' || /\.e2e-spec\.ts$/.test(rel) || process.env.VAQUITA_HOOK_TESTS !== '1') {
  process.exit(0);
}

const cwd = path.join(ROOT, workspace);
const vitest = findBin('vitest/vitest.mjs');
const jest = findBin('jest/bin/jest.js');
let runner = null;
// Jest necesita --experimental-vm-modules para cargar ESM (el backend lo es desde el PR #10).
if (vitest) runner = [vitest, ['related', abs, '--run', '--passWithNoTests']];
else if (jest) runner = [jest, ['--findRelatedTests', abs, '--passWithNoTests', '--silent'], ['--experimental-vm-modules']];
if (!runner) process.exit(0);

try {
  run(runner[0], runner[1], cwd, runner[2]);
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `Los tests relacionados con ${rel} fallan después de este cambio. ` +
        `Corrígelo antes de seguir (CLAUDE.md §8):\n${output || String(error.message)}`,
    }),
  );
}
