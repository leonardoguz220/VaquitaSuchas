import { randomUUID } from 'node:crypto';
import type { Queryable } from '../shared/db/db.service.js';
import { canonicalEmailForBan, normalizeEmail } from '../modules/auth/domain/email.js';
import { validatePassword } from '../modules/auth/domain/password-policy.js';
import { DATA_POLICY_VERSION } from '../modules/auth/policy.js';
import { encryptCi, fingerprint, parseKey } from '../modules/users/services/identity.service.js';

// Núcleo de los comandos `seed:admin` y `seed:dev-users` (spec 003 T022 y T046). Reutiliza el
// cifrado de la CI, las huellas y la política de contraseñas de la aplicación. Nunca escribe
// contraseñas ni claves en la salida.

/** Error de uso del comando (variable faltante, producción sin permiso): se muestra sin traza. */
export class SeedError extends Error {}

export type SeedResult = 'created' | 'exists';

export interface SeedEnv {
  [name: string]: string | undefined;
}

export interface SeedDeps {
  db: Queryable;
  env: SeedEnv;
  hashPassword: (password: string) => Promise<string>;
}

export interface SeedUserInput {
  email: string;
  fullName: string;
  password: string;
  role: 'usuario' | 'admin';
  /** CI sintética (no cumple el formato de una CI real, así no choca con una persona). */
  syntheticCi: string;
  phoneE164: string | null;
  telegramUserId: number | null;
}

function requireVar(env: SeedEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new SeedError(`Falta la variable ${name}.`);
  return value;
}

function keys(env: SeedEnv): { ciKey: Buffer; fingerprintKey: string } {
  return {
    ciKey: parseKey(requireVar(env, 'CI_ENCRYPTION_KEY')),
    fingerprintKey: requireVar(env, 'FINGERPRINT_KEY'),
  };
}

function checkPassword(password: string, email: string): void {
  if (validatePassword(password, email).length > 0) {
    throw new SeedError(
      'La contraseña no cumple la política (mínimo 10 caracteres, con letras y números, distinta del correo).',
    );
  }
}

/** Crea el usuario verificado salvo que el correo ya exista (idempotente por correo, sin pisar nada). */
export async function insertSeedUser(deps: SeedDeps, input: SeedUserInput): Promise<SeedResult> {
  const { ciKey, fingerprintKey } = keys(deps.env);
  const email = normalizeEmail(input.email);
  const passwordHash = await deps.hashPassword(input.password);
  const result = await deps.db.query(
    `INSERT INTO users (full_name, email, email_fingerprint, password_hash, role, ci_encrypted,
                        ci_fingerprint, phone_e164, telegram_user_id, verified_at,
                        data_policy_accepted_at, data_policy_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now(), $10)
     ON CONFLICT (email) DO NOTHING`,
    [
      input.fullName,
      email,
      fingerprint('email', canonicalEmailForBan(email), fingerprintKey),
      passwordHash,
      input.role,
      encryptCi(input.syntheticCi, ciKey),
      fingerprint('ci', input.syntheticCi, fingerprintKey),
      input.phoneE164,
      input.telegramUserId,
      DATA_POLICY_VERSION,
    ],
  );
  return (result.rowCount ?? 0) > 0 ? 'created' : 'exists';
}

/**
 * `seed:admin` (RF-003-22, RN-003-03): administrador verificado sin celular ni Telegram y con CI
 * sintética `ADMIN-<uuid>`. En producción solo con `--allow-production` (spec 009, RF-009-02).
 */
export async function seedAdmin(
  deps: SeedDeps,
  options: { allowProduction: boolean },
): Promise<SeedResult> {
  if (deps.env['NODE_ENV'] === 'production' && !options.allowProduction) {
    throw new SeedError('En producción el administrador solo se crea con --allow-production.');
  }
  const email = requireVar(deps.env, 'SEED_ADMIN_EMAIL');
  const fullName = requireVar(deps.env, 'SEED_ADMIN_NAME');
  const password = requireVar(deps.env, 'SEED_ADMIN_PASSWORD');
  checkPassword(password, email);
  return insertSeedUser(deps, {
    email,
    fullName,
    password,
    role: 'admin',
    syntheticCi: `ADMIN-${randomUUID()}`,
    phoneE164: null,
    telegramUserId: null,
  });
}

/** Cuatro usuarios de prueba: un titular y tres miembros, con datos ficticios fijos. */
export const DEV_USERS: readonly {
  email: string;
  fullName: string;
  phoneE164: string;
  telegramUserId: number;
}[] = [
  {
    email: 'titular@dev.vaquita',
    fullName: 'Titular de Prueba',
    phoneE164: '+59170000001',
    telegramUserId: 900000001,
  },
  {
    email: 'miembro1@dev.vaquita',
    fullName: 'Miembro Uno de Prueba',
    phoneE164: '+59170000002',
    telegramUserId: 900000002,
  },
  {
    email: 'miembro2@dev.vaquita',
    fullName: 'Miembro Dos de Prueba',
    phoneE164: '+59170000003',
    telegramUserId: 900000003,
  },
  {
    email: 'miembro3@dev.vaquita',
    fullName: 'Miembro Tres de Prueba',
    phoneE164: '+59170000004',
    telegramUserId: 900000004,
  },
];

/** `seed:dev-users` (RF-000-06): solo fuera de producción y con `SEED_DEV_PASSWORD`. */
export async function seedDevUsers(deps: SeedDeps): Promise<Record<string, SeedResult>> {
  if (deps.env['NODE_ENV'] === 'production') {
    throw new SeedError('Los usuarios de prueba no se crean en producción.');
  }
  const password = requireVar(deps.env, 'SEED_DEV_PASSWORD');
  for (const user of DEV_USERS) checkPassword(password, user.email);
  const results: Record<string, SeedResult> = {};
  for (const user of DEV_USERS) {
    results[user.email] = await insertSeedUser(deps, {
      ...user,
      password,
      role: 'usuario',
      syntheticCi: `DEV-${randomUUID()}`,
      telegramUserId: user.telegramUserId,
    });
  }
  return results;
}
