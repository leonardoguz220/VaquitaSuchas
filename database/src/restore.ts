// CLI de restauración (spec 000, plan §3 "Respaldo"). Uso:
//   npm run db:restore -- backups/vaquita-20261018T120000Z.sql
// Reemplaza los objetos del respaldo en la base de DATABASE_URL, en una sola transacción.
// Contra un host que no es local se niega salvo con --allow-remote: staging lo restaura a mano
// una persona del equipo (npm run db:restore -- archivo.sql --allow-remote, con la DATABASE_URL
// de staging en el entorno de esa sesión, nunca en el repositorio).
import { parseArgs } from 'node:util';
import { restore } from './backup.ts';
import { errorMessage, isInvokedDirectly, resolveConnectionString } from './cli-support.ts';

async function main(): Promise<void> {
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: { 'allow-remote': { type: 'boolean', default: false } },
    });
    const file = positionals[0];
    if (!file) {
      throw new Error('Indica el archivo: npm run db:restore -- backups/<archivo>.sql');
    }
    const result = await restore({
      connectionString: resolveConnectionString(),
      file,
      allowRemote: values['allow-remote'] === true,
    });
    const via = result.runner === 'docker' ? ' (con psql del contenedor db)' : '';
    process.stdout.write(`Restaurado ${result.file}${via}.\n`);
  } catch (error) {
    process.stderr.write(`Error en db:restore: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (isInvokedDirectly(import.meta.url)) {
  await main();
}
