// CLI de respaldo (spec 000, plan §3 "Respaldo"). Uso:
//   npm run db:dump                              -> database/backups/vaquita-<fecha UTC>.sql
//   npm run db:dump -- backups/antes-demo.sql    -> ruta relativa a database/
// Funciona también contra staging (solo lee); los respaldos no se suben (database/.gitignore).
import { parseArgs } from 'node:util';
import { defaultDumpFile, dump } from './backup.ts';
import { errorMessage, isInvokedDirectly, resolveConnectionString } from './cli-support.ts';

async function main(): Promise<void> {
  try {
    const { positionals } = parseArgs({ allowPositionals: true, options: {} });
    const result = await dump({
      connectionString: resolveConnectionString(),
      file: positionals[0] ?? defaultDumpFile(),
    });
    const via = result.runner === 'docker' ? ' (con pg_dump del contenedor db)' : '';
    process.stdout.write(`Respaldo escrito en ${result.file}${via}.\n`);
  } catch (error) {
    process.stderr.write(`Error en db:dump: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (isInvokedDirectly(import.meta.url)) {
  await main();
}
