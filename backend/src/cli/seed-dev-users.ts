import { Pool } from 'pg';
import { PasswordHasher } from '../modules/auth/services/password-hasher.js';
import { SeedError, seedDevUsers } from './seed-users.js';

// Crea cuatro usuarios de prueba y un segundo administrador (admin2@dev.vaquita, spec 009 T018):
// `npm run seed:dev-users -w backend` (spec 003 T046). Solo corre
// si NODE_ENV no es production. Lee SEED_DEV_PASSWORD (nunca en el repositorio), DATABASE_URL,
// CI_ENCRYPTION_KEY y FINGERPRINT_KEY. No imprime contraseñas.
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL']?.trim();
  if (!connectionString) throw new SeedError('Falta la variable DATABASE_URL.');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const hasher = new PasswordHasher();
    const results = await seedDevUsers({
      db: pool,
      env: process.env,
      hashPassword: (password) => hasher.hash(password),
    });
    for (const [email, result] of Object.entries(results)) {
      process.stdout.write(`${email}: ${result === 'created' ? 'creado' : 'ya existía'}\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error instanceof SeedError ? error.message : error.name}\n`);
  process.exitCode = 1;
});
