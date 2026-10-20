import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { PasswordHasher } from '../../src/modules/auth/services/password-hasher.js';
import { IdentityService } from '../../src/modules/users/services/identity.service.js';
import { Clock } from '../../src/shared/clock/clock.js';
import { requestIdMiddleware } from '../../src/shared/logging/request-id.middleware.js';

// App completa con base temporal propia y Telegram simulado (modo dev) para las e2e de la spec 003.
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://vaquita:vaquita@localhost:5432/vaquita';
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/migrations',
);

export const WEBHOOK_SECRET = 'webhook-secret-de-prueba';
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  JWT_SECRET: 'j'.repeat(32),
  FINGERPRINT_KEY: 'fingerprint-test-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN: 'cd'.repeat(32),
  JOBS_INPROCESS: 'false',
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
  TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STORAGE_DRIVER: 'local',
};

function urlForDatabase(name: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: ADMIN_DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface AuthTestApp {
  app: INestApplication;
  db: Pool;
  http: () => ReturnType<typeof request>;
  /** Registro válido; `overrides` pisa campos del cuerpo. */
  register: (overrides?: Record<string, unknown>) => Promise<request.Response>;
  /** Simula "Iniciar" y luego compartir el contacto en el bot. */
  verifyWithTelegram: (opts: {
    telegramUserId: number;
    token: string;
    phoneNumber: string;
    contactUserId?: number;
  }) => Promise<void>;
  /** Inserta una cuenta directamente (por omisión activa y verificada). */
  createUser: (opts?: {
    email?: string;
    password?: string;
    status?: 'activo' | 'suspendido' | 'baneado';
  }) => Promise<TestUser>;
  /** Sin `ip`, cada llamada llega desde una IP distinta (el límite por IP no mezcla casos). */
  login: (email: string, password: string, ip?: string) => request.Test;
  close: () => Promise<void>;
}

export function tokenFromUrl(telegramUrl: string): string {
  return new URL(telegramUrl).searchParams.get('start') ?? '';
}

export async function startAuthApp(options: { clock?: Clock } = {}): Promise<AuthTestApp> {
  const databaseName = `vaquita_a_${randomBytes(6).toString('hex')}`;
  const originalEnv = { ...process.env };
  try {
    await withAdminClient((c) => c.query(`CREATE DATABASE "${databaseName}"`));
  } catch {
    throw new Error(
      'No hay una PostgreSQL accesible para las pruebas: levanta la base con npm run db:up ' +
        '(o define TEST_DATABASE_URL) y vuelve a correr las pruebas.',
    );
  }
  const db = new Pool({ connectionString: urlForDatabase(databaseName), max: 4 });
  db.on('error', () => undefined);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  for (const file of files) {
    await db.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  Object.assign(process.env, TEST_ENV, { DATABASE_URL: urlForDatabase(databaseName) });
  const { AppModule } = await import('../../src/app.module.js');
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) builder.overrideProvider(Clock).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(requestIdMiddleware);
  await app.init();

  const http = () => request(app.getHttpServer());
  const identity = app.get(IdentityService);
  const hasher = app.get(PasswordHasher);
  let seq = 0;
  const register = (overrides: Record<string, unknown> = {}) => {
    seq += 1;
    // Cada registro llega desde otra IP: el límite de 5 enlaces por hora por IP no mezcla casos.
    return http()
      .post('/auth/register')
      .set('X-Forwarded-For', `10.1.${Math.floor(seq / 250)}.${seq % 250}`)
      .send({
        fullName: 'Ana Prueba',
        email: `ana${seq}@example.com`,
        ci: String(1000000 + seq),
        password: 'clave-segura-123',
        passwordConfirmation: 'clave-segura-123',
        acceptDataPolicy: true,
        ...overrides,
      });
  };
  const verifyWithTelegram = async (opts: {
    telegramUserId: number;
    token: string;
    phoneNumber: string;
    contactUserId?: number;
  }) => {
    await http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'start', telegramUserId: opts.telegramUserId, token: opts.token });
    await http()
      .post('/dev/telegram/simulate')
      .send({
        kind: 'contact',
        telegramUserId: opts.telegramUserId,
        phoneNumber: opts.phoneNumber,
        contactUserId: opts.contactUserId ?? opts.telegramUserId,
      });
  };
  let userSeq = 0;
  const createUser: AuthTestApp['createUser'] = async (opts = {}) => {
    userSeq += 1;
    const email = opts.email ?? `usuario${userSeq}@example.com`;
    const password = opts.password ?? 'clave-segura-123';
    const ci = String(2000000 + userSeq);
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
         ci_fingerprint, phone_e164, telegram_user_id, verified_at, status,
         data_policy_accepted_at, data_policy_version)
       VALUES ('Usuaria Prueba', $1, $2, $3, $4, $5, $6, $7, now(), $8, now(), 'v1')
       RETURNING id`,
      [
        email,
        identity.emailFingerprint(email),
        await hasher.hash(password),
        identity.encryptCi(ci),
        identity.fingerprint('ci', ci),
        `+5916${String(1000000 + userSeq)}`,
        5000 + userSeq,
        opts.status ?? 'activo',
      ],
    );
    return { id: inserted.rows[0]!.id, email, password };
  };
  let loginSeq = 0;
  const login = (email: string, password: string, ip?: string) => {
    loginSeq += 1;
    return http()
      .post('/auth/login')
      .set('X-Forwarded-For', ip ?? `10.2.${Math.floor(loginSeq / 250)}.${loginSeq % 250}`)
      .send({ email, password });
  };
  const close = async () => {
    await app.close();
    process.env = { ...originalEnv };
    await db.end();
    await withAdminClient((c) => c.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  };
  return { app, db, http, register, verifyWithTelegram, createUser, login, close };
}
