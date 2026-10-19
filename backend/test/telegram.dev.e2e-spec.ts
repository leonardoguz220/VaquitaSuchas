import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { requestIdMiddleware } from '../src/shared/logging/request-id.middleware.js';
import type { ParsedUpdate } from '../src/modules/telegram/domain/telegram-update.js';

// CA-000-17: con TELEGRAM_MODE=dev el simulador reemplaza al bot real y no sale a internet.
// Requiere PostgreSQL (base temporal propia, como jobs.tick.e2e-spec.ts).
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);
const SECRET = 'webhook-secret-de-prueba';

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
  TELEGRAM_WEBHOOK_SECRET: SECRET,
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

describe('Telegram en modo dev (CA-000-17)', () => {
  const databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let inspect: Pool;
  let app: INestApplication;
  let fetchCalls: number;
  let received: ParsedUpdate[];

  async function boot(): Promise<void> {
    Object.assign(process.env, TEST_ENV, {
      DATABASE_URL: urlForDatabase(databaseName),
    });
    const { AppModule } = await import('../src/app.module.js');
    const { TelegramDispatcher } =
      await import('../src/modules/telegram/services/telegram-dispatcher.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    await app.init();
    received = [];
    app.get(TelegramDispatcher).register({
      handle: async (update: ParsedUpdate) => {
        received.push(update);
      },
    });
  }

  beforeAll(async () => {
    try {
      await withAdminClient((c) => c.query(`CREATE DATABASE "${databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible para las pruebas de Telegram: levanta la base con ' +
          'npm run db:up (o define TEST_DATABASE_URL) y vuelve a correr las pruebas.',
      );
    }
    inspect = new Pool({ connectionString: urlForDatabase(databaseName), max: 2 });
    inspect.on('error', () => undefined);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      await inspect.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
  }, 30_000);

  afterAll(async () => {
    process.env = { ...originalEnv };
    await inspect?.end();
    await withAdminClient((c) => c.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  }, 30_000);

  beforeEach(async () => {
    await inspect.query('DELETE FROM telegram_updates');
    fetchCalls = 0;
    // Cualquier salida HTTP externa del proceso se cuenta y se rechaza.
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('salida a internet bloqueada en la prueba');
    }) as typeof fetch;
    await boot();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('CA-000-17: simula start y contact con un token válido y el backend los recibe', async () => {
    const start = await http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'start', telegramUserId: 555, token: 'tok-valido' });
    const contact = await http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'contact', telegramUserId: 555, phoneNumber: '+59171234567' });

    expect(start.status).toBe(200);
    expect(contact.status).toBe(200);
    expect(received.map((u) => u.command)).toEqual([
      { type: 'start', token: 'tok-valido' },
      { type: 'contact', phoneNumber: '+59171234567', contactUserId: 555 },
    ]);
    expect(received[0]?.telegramUserId).toBe(555);
    const rows = await inspect.query('SELECT update_id FROM telegram_updates');
    expect(rows.rowCount).toBe(2);
  });

  it('CA-000-17: un update_id repetido por el webhook no se procesa dos veces', async () => {
    const update = {
      update_id: 900001,
      message: { from: { id: 8 }, chat: { id: 8 }, text: '/start abc' },
    };
    const send = () =>
      http().post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(update);

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    const rows = await inspect.query('SELECT update_id FROM telegram_updates');
    expect(rows.rowCount).toBe(1);
  });

  it('CA-000-17: el cliente HTTP externo no se invoca', async () => {
    await http().post('/dev/telegram/simulate').send({ kind: 'start', telegramUserId: 1 });
    await http().get('/dev/telegram/outbox?telegramUserId=1');

    expect(fetchCalls).toBe(0);
  });

  it('RF-000-22: el webhook sin secreto o con secreto incorrecto responde 401', async () => {
    const update = { update_id: 900002 };
    const missing = await http().post('/telegram/webhook').send(update);
    const wrong = await http()
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'otro')
      .send(update);

    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHENTICATED');
    expect(wrong.status).toBe(401);
    expect(received).toHaveLength(0);
  });

  it('RF-000-22: un cuerpo sin update_id válido responde 200 y se ignora', async () => {
    const res = await http()
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
      .send({ foo: 'bar' });

    expect(res.status).toBe(200);
    expect(received).toHaveLength(0);
  });

  it('CA-000-17: la bandeja de salida muestra lo que el bot "envió" a esa cuenta', async () => {
    const { TelegramGateway } = await import('../src/modules/telegram/ports/telegram.gateway.js');
    await app.get(TelegramGateway).sendMessage(42, {
      text: 'Comparte tu contacto',
      buttons: [{ text: 'Compartir', requestContact: true }],
    });

    const res = await http().get('/dev/telegram/outbox?telegramUserId=42');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([
      { text: 'Comparte tu contacto', buttons: [{ text: 'Compartir', requestContact: true }] },
    ]);
  });

  it('CA-000-17: simulate con datos inválidos responde 400 VALIDATION_ERROR', async () => {
    const res = await http()
      .post('/dev/telegram/simulate')
      .send({ kind: 'otra', telegramUserId: 0 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
