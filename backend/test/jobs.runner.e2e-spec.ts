import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import { Clock } from '../src/shared/clock/clock.js';
import { ClockModule } from '../src/shared/clock/clock.module.js';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { DbModule } from '../src/shared/db/db.module.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { JobsModule } from '../src/shared/jobs/jobs.module.js';
import type { JobContext, ScheduledJob } from '../src/shared/jobs/scheduled-job.js';

// Prueba de integración del runner contra PostgreSQL REAL (RF-000-14). Usa una base temporal
// propia, creada y borrada aquí: no toca los datos de la base local ni la resetea. Las
// credenciales por defecto son las de desarrollo local de docker-compose.yml (no son secretos).
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);

const NOW = '2026-06-15T12:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ago = (ms: number): Date => new Date(new Date(NOW).getTime() - ms);

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

interface JobRunRow {
  job_name: string;
  trigger: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  processed_count: number;
  error_message: string | null;
}

describe('JobRunner contra PostgreSQL real', () => {
  const databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  const databaseUrl = urlForDatabase(databaseName);
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JOBS_INPROCESS: process.env.JOBS_INPROCESS,
  };
  let inspect: Pool;
  let moduleRef: TestingModule;
  let registry: JobRegistry;
  let runner: JobRunner;
  let clock: FakeClock;

  beforeAll(async () => {
    try {
      await withAdminClient((client) => client.query(`CREATE DATABASE "${databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible para las pruebas del runner de tareas: levanta la base ' +
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
    // 0003 deja rate_limit_events como solo anexado y bloquea todo DELETE (pendiente T033 con
    // Camila). Aquí se quita el disparador, en esta base temporal, para comprobar la lógica de la
    // limpieza; cuando la migración de T033 resuelva el permiso, esta línea ya no hará falta.
    await inspect.query(
      'DROP TRIGGER IF EXISTS rate_limit_events_forbid_update_delete ON rate_limit_events',
    );

    // ConfigService da prioridad a process.env: se apunta a la base temporal y sin cron interno.
    process.env.DATABASE_URL = databaseUrl;
    process.env.JOBS_INPROCESS = 'false';
  }, 30_000);

  afterAll(async () => {
    restoreEnv('DATABASE_URL');
    restoreEnv('JOBS_INPROCESS');
    await inspect?.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
    );
  }, 30_000);

  function restoreEnv(key: keyof typeof originalEnv): void {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }

  // Una aplicación nueva por prueba: registro de tareas y pool aislados, sin tareas de otra prueba.
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await inspect.query('DELETE FROM job_runs');
    clock = new FakeClock(NOW);
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        ClockModule,
        DbModule,
        JobsModule,
      ],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    await moduleRef.init();
    registry = moduleRef.get(JobRegistry);
    runner = moduleRef.get(JobRunner);
  });

  afterEach(async () => {
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  async function jobRuns(name?: string): Promise<JobRunRow[]> {
    const result = await inspect.query<JobRunRow>(
      `SELECT job_name, trigger, status, started_at, finished_at, processed_count, error_message
         FROM job_runs
        WHERE ($1::text IS NULL OR job_name = $1)
        ORDER BY started_at, created_at`,
      [name ?? null],
    );
    return result.rows;
  }

  async function advisoryLocksHeld(): Promise<number> {
    const result = await inspect.query<{ total: string }>(
      `SELECT count(*) AS total
         FROM pg_locks
        WHERE locktype = 'advisory'
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    return Number(result.rows[0]?.total);
  }

  it('RF-000-14: una ejecución escribe job_runs en running y la deja en ok con su conteo y duración', async () => {
    const seen: string[] = [];
    registry.register({
      name: 'test.observe',
      intervalSeconds: 0,
      run: async () => {
        // Durante la ejecución la fila ya existe y está en `running`.
        seen.push(...(await jobRuns('test.observe')).map((row) => row.status));
        clock.advance(1500);
        return 5;
      },
    });

    const results = await runner.runAll('external', { job: 'test.observe' });

    expect(results).toEqual([{ job: 'test.observe', status: 'ok', processed: 5 }]);
    expect(seen).toEqual(['running']);
    const rows = await jobRuns('test.observe');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trigger: 'external',
      status: 'ok',
      processed_count: 5,
      error_message: null,
    });
    expect(rows[0]?.started_at).toEqual(new Date(NOW));
    expect(rows[0]?.finished_at).toEqual(new Date('2026-06-15T12:00:01.500Z'));
  });

  it('RF-000-14: runAll("cron") ejecuta las tareas incluidas (example.noop y maintenance.cleanup) sin error', async () => {
    const results = await runner.runAll('cron');

    expect(results).toEqual([
      { job: 'example.noop', status: 'ok', processed: 0 },
      { job: 'maintenance.cleanup', status: 'ok', processed: 0 },
    ]);
    expect((await jobRuns()).map((row) => [row.job_name, row.status])).toEqual([
      ['example.noop', 'ok'],
      ['maintenance.cleanup', 'ok'],
    ]);
  });

  it('RF-000-14: dos runAll concurrentes sobre la misma tarea lenta -> una ok y la otra skipped por el bloqueo asesor', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const running = new Promise<void>((resolve) => (started = resolve));
    const run = jest.fn(async (_ctx: JobContext) => {
      started();
      await gate;
      return 7;
    });
    registry.register({ name: 'test.slow', intervalSeconds: 0, run });

    const first = runner.runAll('external', { job: 'test.slow' });
    await running;
    const second = await runner.runAll('external', { job: 'test.slow' });

    expect(second).toEqual([{ job: 'test.slow', status: 'skipped', reason: 'locked' }]);
    expect(await advisoryLocksHeld()).toBe(1);

    release();
    expect(await first).toEqual([{ job: 'test.slow', status: 'ok', processed: 7 }]);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await jobRuns('test.slow')).map((row) => row.status)).toEqual(['ok']);
    expect(await advisoryLocksHeld()).toBe(0);
  });

  it('RF-000-14: lanzadas a la vez (Promise.all) solo una ejecuta la tarea y la otra se omite', async () => {
    const run = jest.fn(async (_ctx: JobContext) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return 1;
    });
    registry.register({ name: 'test.parallel', intervalSeconds: 0, run });

    const results = await Promise.all([
      runner.runAll('cron', { job: 'test.parallel' }),
      runner.runAll('external', { job: 'test.parallel' }),
    ]);

    expect(
      results
        .flat()
        .map((result) => result.status)
        .sort(),
    ).toEqual(['ok', 'skipped']);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await jobRuns('test.parallel')).toHaveLength(1);
  });

  it('RF-000-14: una tarea que lanza deja la fila en error sin datos personales, libera el bloqueo y la siguiente corre', async () => {
    const boom: ScheduledJob = {
      name: 'test.boom',
      intervalSeconds: 0,
      run: () => Promise.reject(new Error('fallo con ana@example.com y cédula 1234567')),
    };
    const after = { name: 'test.after', intervalSeconds: 0, run: jest.fn(async () => 4) };
    registry.register(boom);
    registry.register(after);

    const results = await runner.runAll('cron');

    expect(results.filter((result) => result.job.startsWith('test.'))).toEqual([
      { job: 'test.boom', status: 'error', error: 'Error' },
      { job: 'test.after', status: 'ok', processed: 4 },
    ]);
    const [row] = await jobRuns('test.boom');
    expect(row).toMatchObject({ status: 'error', processed_count: 0, error_message: 'Error' });
    expect(row?.finished_at).not.toBeNull();
    expect(JSON.stringify(await jobRuns())).not.toMatch(/ana@example\.com|1234567/);
    expect(await advisoryLocksHeld()).toBe(0);

    // El bloqueo se liberó: volver a ejecutar la tarea no la omite.
    expect(await runner.runAll('cron', { job: 'test.boom' })).toEqual([
      { job: 'test.boom', status: 'error', error: 'Error' },
    ]);
    expect(await jobRuns('test.boom')).toHaveLength(2);
  });

  it('RF-000-14: intervalSeconds con la base real: omite dentro del intervalo sin escribir otra fila y vuelve a correr al cumplirse', async () => {
    const run = jest.fn(async (_ctx: JobContext) => 1);
    registry.register({ name: 'test.hourly', intervalSeconds: 3600, run });

    await runner.runAll('external', { job: 'test.hourly' });
    clock.advance(3599 * 1000);
    const early = await runner.runAll('external', { job: 'test.hourly' });
    clock.advance(1000);
    const due = await runner.runAll('external', { job: 'test.hourly' });

    expect(early).toEqual([{ job: 'test.hourly', status: 'skipped', reason: 'interval' }]);
    expect(due).toEqual([{ job: 'test.hourly', status: 'ok', processed: 1 }]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(await jobRuns('test.hourly')).toHaveLength(2);
  });

  it('RF-000-14: maintenance.cleanup borra solo las filas viejas de job_runs, rate_limit_events y telegram_updates', async () => {
    await inspect.query(
      `INSERT INTO job_runs (job_name, trigger, status, started_at) VALUES
         ('old.job', 'cron', 'ok', $1), ('recent.job', 'cron', 'ok', $2)`,
      [ago(30 * DAY_MS + HOUR_MS), ago(30 * DAY_MS - HOUR_MS)],
    );
    await inspect.query('DELETE FROM rate_limit_events');
    await inspect.query(
      `INSERT INTO rate_limit_events (bucket, key_hash, occurred_at) VALUES
         ('login_fail:email', 'old', $1), ('login_fail:email', 'recent', $2)`,
      [ago(24 * HOUR_MS + 60_000), ago(24 * HOUR_MS - 60_000)],
    );
    await inspect.query('DELETE FROM telegram_updates');
    await inspect.query(
      `INSERT INTO telegram_updates (update_id, received_at) VALUES (1, $1), (2, $2)`,
      [ago(7 * DAY_MS + HOUR_MS), ago(7 * DAY_MS - HOUR_MS)],
    );

    const results = await runner.runAll('external', { job: 'maintenance.cleanup' });

    expect(results).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 3 }]);
    expect((await jobRuns()).map((row) => row.job_name).sort()).toEqual([
      'maintenance.cleanup',
      'recent.job',
    ]);
    const limits = await inspect.query<{ key_hash: string }>(
      'SELECT key_hash FROM rate_limit_events',
    );
    expect(limits.rows.map((row) => row.key_hash)).toEqual(['recent']);
    const updates = await inspect.query<{ update_id: string }>(
      'SELECT update_id FROM telegram_updates',
    );
    expect(updates.rows.map((row) => Number(row.update_id))).toEqual([2]);
  });

  it('RF-000-14: maintenance.cleanup es idempotente: una segunda pasada no borra nada más', async () => {
    await inspect.query(`INSERT INTO telegram_updates (update_id, received_at) VALUES (10, $1)`, [
      ago(8 * DAY_MS),
    ]);

    const first = await runner.runAll('external', { job: 'maintenance.cleanup' });
    const second = await runner.runAll('external', {
      job: 'maintenance.cleanup',
      ignoreInterval: true,
    });

    expect(first).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 1 }]);
    expect(second).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 0 }]);
  });
});
