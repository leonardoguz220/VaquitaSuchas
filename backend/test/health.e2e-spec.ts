import { createServer } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/shared/db/pg-pool.js';

// Credenciales de desarrollo local de docker-compose.yml (database/.env.example): no son secretos.
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const REAL_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;

// Entorno mínimo válido para validateEnv (RF-000-08): valores ficticios, sin archivo .env.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: REAL_DATABASE_URL,
  JWT_SECRET: 'j'.repeat(32),
  FINGERPRINT_KEY: 'fingerprint-test-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN: 'cd'.repeat(32),
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
  STORAGE_DRIVER: 'local',
};

const HEALTH_KEYS = ['database', 'status', 'time', 'uptimeSeconds', 'version'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Un puerto local en el que seguro no escucha nadie: se abre uno efímero y se cierra. */
async function closedLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function createApp(pool?: Pool): Promise<INestApplication> {
  Object.assign(process.env, TEST_ENV);
  // ConfigModule.forRoot lee el entorno al evaluar app.module.ts: se importa ya con el entorno listo.
  const { AppModule } = await import('../src/app.module.js');
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (
    pool ? builder.overrideProvider(PG_POOL).useValue(pool) : builder
  ).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health con la base arriba', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const probe = new Pool({ connectionString: REAL_DATABASE_URL, connectionTimeoutMillis: 3000 });
    probe.on('error', () => undefined);
    try {
      await probe.query('SELECT 1');
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible para la prueba de /health: levanta la base con npm run db:up ' +
          '(o define TEST_DATABASE_URL) y vuelve a correr las pruebas.',
      );
    } finally {
      await probe.end();
    }
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('CA-000-06 y RF-000-09: responde 200 ok con el estado de la base y exactamente las claves del contrato', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(HEALTH_KEYS);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0');
    expect(Number.isInteger(res.body.uptimeSeconds)).toBe(true);
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(res.body.database).sort()).toEqual(['latencyMs', 'status']);
    expect(res.body.database.status).toBe('up');
    expect(typeof res.body.database.latencyMs).toBe('number');
    expect(res.body.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body.time).toMatch(ISO_UTC);
    expect(new Date(res.body.time).toISOString()).toBe(res.body.time);
  });

  it('CA-000-06: es pública, no pide sesión', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
  });

  it('CA-000-06: el cuerpo no contiene la URL de conexión, el usuario ni la clave de la base', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    const url = new URL(REAL_DATABASE_URL);
    const text = res.text;
    for (const secret of [REAL_DATABASE_URL, url.username, url.password, TEST_ENV.JWT_SECRET]) {
      if (secret) {
        expect(text).not.toContain(secret);
      }
    }
    expect(text).not.toMatch(/postgres(ql)?:\/\//i);
  });
});

describe('GET /health con la base caída', () => {
  let app: INestApplication;
  const DOWN_USER = 'usr_sentinel';
  const DOWN_PASSWORD = 'pw_sentinel';
  const DOWN_DATABASE = 'db_sentinel';
  let downUrl: string;
  let port: number;

  beforeAll(async () => {
    port = await closedLocalPort();
    downUrl = `postgres://${DOWN_USER}:${DOWN_PASSWORD}@127.0.0.1:${port}/${DOWN_DATABASE}`;
    app = await createApp(new Pool({ connectionString: downUrl }));
  }, 15_000);

  afterAll(async () => {
    await app?.close();
  }, 15_000);

  it('CA-000-06 y RF-000-09: responde 200 degraded con database down y las claves del contrato', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(HEALTH_KEYS);
    expect(res.body.status).toBe('degraded');
    expect(res.body.database).toEqual({ status: 'down', latencyMs: null });
    expect(res.body.time).toMatch(ISO_UTC);
    expect(Number.isInteger(res.body.uptimeSeconds)).toBe(true);
  }, 10_000);

  it('CA-000-06 y RF-000-09: el cuerpo degradado no filtra credenciales, host, puerto ni textos de error de pg', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    const text = res.text.toLowerCase();
    for (const leaked of [
      downUrl,
      DOWN_USER,
      DOWN_PASSWORD,
      DOWN_DATABASE,
      '127.0.0.1',
      String(port),
      'postgres://',
      'econnrefused',
      'password',
      'connect',
      'error',
      'stack',
    ]) {
      expect(text).not.toContain(leaked.toLowerCase());
    }
  }, 10_000);

  it('RF-000-09: el proceso sigue vivo tras el fallo y puede responder otra consulta', async () => {
    const first = await request(app.getHttpServer()).get('/health');
    const second = await request(app.getHttpServer()).get('/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('degraded');
  }, 10_000);
});
