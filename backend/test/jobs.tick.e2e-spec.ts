import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { Clock } from '../src/shared/clock/clock.js';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { requestIdMiddleware } from '../src/shared/logging/request-id.middleware.js';

// POST /internal/jobs/tick de punta a punta (RF-000-14) contra PostgreSQL REAL, con el AppModule
// completo. Usa una base temporal propia, creada y borrada aquí: no toca los datos de la base local
// ni la resetea. Las credenciales por defecto son las de desarrollo local de docker-compose.yml.
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);

const JOBS_TOKEN = 'cd'.repeat(32);
const NOW = '2026-10-18T12:00:00.000Z';
const A_SECOND = 1000;

// Entorno mínimo válido para validateEnv (RF-000-08): valores ficticios, sin archivo .env.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  JWT_SECRET: 'j'.repeat(32),
  FINGERPRINT_KEY: 'fingerprint-test-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN,
  JOBS_INPROCESS: 'false',
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
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

describe('POST /internal/jobs/tick contra PostgreSQL real', () => {
  const databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  const databaseUrl = urlForDatabase(databaseName);
  const originalEnv = { ...process.env };
  let inspect: Pool;
  let app: INestApplication;
  let clock: FakeClock;

  beforeAll(async () => {
    try {
      await withAdminClient((client) => client.query(`CREATE DATABASE "${databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible para las pruebas del tick de tareas: levanta la base ' +
          'con npm run db:up (o define TEST_DATABASE_URL) y vuelve a correr las pruebas.',
      );
    }

    inspect = new Pool({ connectionString: databaseUrl, max: 2 });
    inspect.on('error', () => undefined);

    // Esquema real: las migraciones de database/ en orden (solo lectura de esos archivos).
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      await inspect.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }

    Object.assign(process.env, TEST_ENV, { DATABASE_URL: databaseUrl });
  }, 30_000);

  afterAll(async () => {
    process.env = { ...originalEnv };
    await inspect?.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
    );
  }, 30_000);

  // Una aplicación nueva por prueba: registro de tareas, pool y estado del límite aislados.
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await inspect.query('DELETE FROM job_runs');
    clock = new FakeClock(NOW);
    // ConfigModule.forRoot lee el entorno al evaluar app.module.ts: se importa ya con el entorno listo.
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    // Igual que main.ts: el identificador de petición se asigna antes que todo lo demás.
    app.use(requestIdMiddleware);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());
  const tick = (query = '') =>
    http().post(`/internal/jobs/tick${query}`).set('X-Jobs-Token', JOBS_TOKEN);
  /** Deja pasar la ventana de 1 s del límite sin esperar de verdad. */
  const nextWindow = (): void => clock.advance(A_SECOND);

  async function jobRuns(name?: string): Promise<{ job_name: string; trigger: string }[]> {
    const result = await inspect.query<{ job_name: string; trigger: string }>(
      `SELECT job_name, trigger FROM job_runs WHERE ($1::text IS NULL OR job_name = $1)`,
      [name ?? null],
    );
    return result.rows;
  }

  const unauthenticatedBody = {
    statusCode: 401,
    code: 'UNAUTHENTICATED',
    message: 'Credencial de servicio inválida.',
  };

  it('RF-000-14: sin X-Jobs-Token responde 401 UNAUTHENTICATED en el formato A.2 y no ejecuta nada', async () => {
    const res = await http().post('/internal/jobs/tick');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticatedBody);
    expect(await jobRuns()).toEqual([]);
  });

  it('RF-000-14: con un X-Jobs-Token incorrecto responde 401 idéntico y sin eco de ningún token', async () => {
    const sent = 'token-equivocado-que-no-debe-aparecer';

    const res = await http().post('/internal/jobs/tick').set('X-Jobs-Token', sent);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(unauthenticatedBody);
    expect(res.text).not.toContain(sent);
    expect(res.text).not.toContain(JOBS_TOKEN);
    expect(await jobRuns()).toEqual([]);
  });

  it('RF-000-14: con el token correcto responde 200 (no 201) con example.noop y maintenance.cleanup en ok', async () => {
    const res = await tick();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      ran: [
        { job: 'example.noop', status: 'ok', processed: 0 },
        { job: 'maintenance.cleanup', status: 'ok', processed: 0 },
        { job: 'auth.purge_unverified', status: 'ok', processed: 0 },
        { job: 'auth.retry_mail', status: 'ok', processed: 0 },
        { job: 'billing.generate', status: 'ok', processed: 0 },
      ],
    });
  });

  it('RF-000-14: la ejecución queda en job_runs con trigger "external"', async () => {
    await tick('?job=example.noop');

    expect(await jobRuns()).toEqual([{ job_name: 'example.noop', trigger: 'external' }]);
  });

  it('RF-000-14: ?job= ejecuta solo esa tarea', async () => {
    const res = await tick('?job=maintenance.cleanup');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ran: [{ job: 'maintenance.cleanup', status: 'ok', processed: 0 }],
    });
  });

  it('RF-000-14: ?job= con un nombre válido pero sin tarea registrada responde 200 con ran vacío', async () => {
    const res = await tick('?job=no.existe');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ran: [] });
    expect(await jobRuns()).toEqual([]);
  });

  it.each([
    ['con mayúsculas y espacio', '?job=Mala%20Tarea'],
    ['sin espacio de nombres', '?job=sinpunto'],
    ['vacío', '?job='],
    ['con inyección de ruta', '?job=..%2F..%2Fetc.passwd'],
    ['repetido', '?job=example.noop&job=maintenance.cleanup'],
  ])(
    'RF-000-14: ?job= %s responde 400 VALIDATION_ERROR en el formato A.2',
    async (_name, query) => {
      const res = await tick(query);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: { fields: { job: expect.any(Array) } },
      });
      expect(await jobRuns()).toEqual([]);
    },
  );

  it('RF-000-14: el nombre de tarea inválido se informa con un código estable', async () => {
    const res = await tick('?job=Mala%20Tarea');

    expect((res.body as { details: unknown }).details).toEqual({
      fields: { job: ['INVALID_JOB_NAME'] },
    });
  });

  it('RF-000-14: es idempotente: un segundo tick tras 1 s omite example.noop por intervalo y no duplica efectos', async () => {
    const first = await tick('?job=example.noop');
    nextWindow();
    const second = await tick('?job=example.noop');

    expect(first.body).toEqual({ ran: [{ job: 'example.noop', status: 'ok', processed: 0 }] });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      ran: [{ job: 'example.noop', status: 'skipped', reason: 'interval' }],
    });
    expect(await jobRuns('example.noop')).toHaveLength(1);
  });

  it('RF-000-14: dos ticks concurrentes de una tarea lenta -> uno ok y otro skipped por el bloqueo asesor', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const running = new Promise<void>((resolve) => (started = resolve));
    const run = jest.fn(async () => {
      started();
      await gate;
      return 7;
    });
    app.get(JobRegistry).register({ name: 'test.slow', intervalSeconds: 0, run });

    // El método then() de supertest envía la petición sin esperar su respuesta.
    const first = tick('?job=test.slow').then((res) => res);
    let second: request.Response;
    try {
      // Si la primera petición termina sin haber arrancado la tarea, no se espera para siempre.
      await Promise.race([running, first]);
      nextWindow();
      second = await tick('?job=test.slow');
    } finally {
      // Aunque algo falle arriba, la tarea se libera: si no, cerrar la app quedaría colgado.
      release();
    }
    const firstResponse = await first;

    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      ran: [{ job: 'test.slow', status: 'skipped', reason: 'locked' }],
    });
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body).toEqual({ ran: [{ job: 'test.slow', status: 'ok', processed: 7 }] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await jobRuns('test.slow')).toHaveLength(1);
  });

  it('RF-000-14: una tarea que falla se informa como status "error" sin datos internos y no impide las demás', async () => {
    app.get(JobRegistry).register({
      name: 'test.boom',
      intervalSeconds: 0,
      run: () => Promise.reject(new Error('fallo con ana@example.com')),
    });

    const res = await tick();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ran: [
        { job: 'example.noop', status: 'ok', processed: 0 },
        { job: 'maintenance.cleanup', status: 'ok', processed: 0 },
        { job: 'auth.purge_unverified', status: 'ok', processed: 0 },
        { job: 'auth.retry_mail', status: 'ok', processed: 0 },
        { job: 'billing.generate', status: 'ok', processed: 0 },
        { job: 'test.boom', status: 'error', error: 'Error' },
      ],
    });
    expect(res.text).not.toContain('ana@example.com');
  });

  describe('límite de 1 llamada por segundo', () => {
    it('RF-000-14: la segunda llamada válida dentro del mismo segundo responde 429 RATE_LIMITED con retryAfterSeconds', async () => {
      const first = await tick('?job=example.noop');
      clock.advance(400);
      const second = await tick('?job=example.noop');

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.body).toEqual({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Demasiadas llamadas al disparador de tareas. Intenta de nuevo en un momento.',
        details: { retryAfterSeconds: 1 },
      });
    });

    it('RF-000-14: pasado el segundo vuelve a aceptar, y el 429 no ejecutó ninguna tarea', async () => {
      await tick('?job=example.noop');
      const limited = await tick('?job=maintenance.cleanup');
      nextWindow();
      const allowed = await tick('?job=maintenance.cleanup');

      expect(limited.status).toBe(429);
      expect(allowed.status).toBe(200);
      expect(allowed.body).toEqual({
        ran: [{ job: 'maintenance.cleanup', status: 'ok', processed: 0 }],
      });
      expect(await jobRuns('maintenance.cleanup')).toHaveLength(1);
    });

    it('RF-000-14: las llamadas sin token válido NO consumen el límite (un anónimo no deja fuera al cron)', async () => {
      const anonymous = await Promise.all([
        ...Array.from({ length: 3 }, () => http().post('/internal/jobs/tick')),
        ...Array.from({ length: 3 }, () =>
          http().post('/internal/jobs/tick').set('X-Jobs-Token', 'x'.repeat(64)),
        ),
      ]);

      // Mismo instante del reloj: si el anónimo gastara el cupo, esta llamada daría 429.
      const legitimate = await tick('?job=example.noop');

      expect(anonymous.map((res) => res.status)).toEqual([401, 401, 401, 401, 401, 401]);
      expect(legitimate.status).toBe(200);
    });

    it('RF-000-14: el 429 no revela el token y lleva el mismo formato de error', async () => {
      await tick('?job=example.noop');

      const res = await tick('?job=example.noop');

      expect(res.status).toBe(429);
      expect(Object.keys(res.body as object).sort()).toEqual([
        'code',
        'details',
        'message',
        'statusCode',
      ]);
      expect(res.text).not.toContain(JOBS_TOKEN);
    });
  });

  describe('trazabilidad', () => {
    it('RF-000-14: X-Request-Id vuelve en la respuesta de éxito, de 401 y de 429', async () => {
      const ok = await tick('?job=example.noop').set('X-Request-Id', 'tick-ok-1');
      const unauthenticated = await http()
        .post('/internal/jobs/tick')
        .set('X-Request-Id', 'tick-401-1');
      const limited = await tick('?job=example.noop').set('X-Request-Id', 'tick-429-1');

      expect(ok.headers['x-request-id']).toBe('tick-ok-1');
      expect(unauthenticated.headers['x-request-id']).toBe('tick-401-1');
      expect(limited.status).toBe(429);
      expect(limited.headers['x-request-id']).toBe('tick-429-1');
    });

    it('RF-000-14: sin X-Request-Id el servidor genera uno', async () => {
      const res = await tick('?job=example.noop');

      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
