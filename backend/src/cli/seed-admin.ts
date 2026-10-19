import { Pool } from 'pg';
import { PasswordHasher } from '../modules/auth/services/password-hasher.js';
import { SeedError, seedAdmin } from './seed-users.js';

// Crea el administrador: `npm run seed:admin -w backend` (spec 003 T022).
// Lee SEED_ADMIN_EMAIL, SEED_ADMIN_NAME y SEED_ADMIN_PASSWORD, además de DATABASE_URL,
// CI_ENCRYPTION_KEY y FINGERPRINT_KEY. En producción exige --allow-production. No imprime secretos.
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL']?.trim();
  if (!connectionString) throw new SeedError('Falta la variable DATABASE_URL.');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const hasher = new PasswordHasher();
    const result = await seedAdmin(
      { db: pool, env: process.env, hashPassword: (password) => hasher.hash(password) },
      { allowProduction: process.argv.includes('--allow-production') },
    );
    process.stdout.write(
      result === 'created'
        ? 'Administrador creado.\n'
        : 'El administrador ya existe; no se cambió.\n',
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error instanceof SeedError ? error.message : error.name}\n`);
  process.exitCode = 1;
});
