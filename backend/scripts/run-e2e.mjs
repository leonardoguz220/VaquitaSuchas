// Corre las pruebas e2e en fragmentos secuenciales (`jest --shard`), cada uno en su propio proceso.
//
// Con `--experimental-vm-modules` Jest conserva en memoria los módulos de cada archivo de prueba
// hasta que termina el proceso, así que correr todo en uno solo (`--runInBand`) acumula heap con
// cada suite hasta agotarlo (CI: "Ineffective mark-compacts near heap limit", exit 134).
// Repartir las suites en varios procesos mantiene el heap de cada uno acotado sin saltar pruebas.
//
// Uso: `npm run test:e2e` (todo, en E2E_SHARDS fragmentos; 4 por omisión) o
//      `npm run test:e2e -- <patrón>` (argumentos propios de Jest: un solo proceso, sin fragmentar).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const jest = fileURLToPath(new URL('../../node_modules/jest/bin/jest.js', import.meta.url));
const extraArgs = process.argv.slice(2);
const shards = extraArgs.length > 0 ? 1 : Math.max(1, Number(process.env.E2E_SHARDS ?? 4));

const baseArgs = [
  '--max-old-space-size=4096',
  '--experimental-vm-modules',
  jest,
  '--selectProjects',
  'e2e',
  '--runInBand',
  '--passWithNoTests',
];

let exitCode = 0;
for (let shard = 1; shard <= shards; shard += 1) {
  const args = [...baseArgs, ...(shards > 1 ? [`--shard=${shard}/${shards}`] : []), ...extraArgs];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  }
}
process.exit(exitCode);
