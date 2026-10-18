// RF-000-14 y RF-000-07 (data-model.md §1 y §3): 0002_job_runs.sql crea job_runs con sus
// restricciones, el índice job_runs_name_started_idx y el disparador set_updated_at.
// Cada restricción se prueba intentando violarla.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

interface JobRunRow {
  id: string;
  job_name: string;
  trigger: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  processed_count: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PgError {
  code?: string;
  constraint?: string;
  column?: string;
}

async function rejectsWith(
  sql: string,
  params: unknown[],
  expected: { code: string; constraint?: string; column?: string },
): Promise<void> {
  await assert.rejects(queryRows(db.connectionString, sql, params), (error: PgError) => {
    assert.equal(error.code, expected.code);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    if (expected.column) assert.equal(error.column, expected.column);
    return true;
  });
}

const INSERT = 'INSERT INTO job_runs (job_name, trigger, status) VALUES ($1, $2, $3)';

test('RF-000-14: un insert válido toma los valores por defecto (id uuid, processed_count 0, fechas)', async () => {
  const [row] = await queryRows<JobRunRow>(db.connectionString, `${INSERT} RETURNING *`, [
    'billing.generate',
    'cron',
    'running',
  ]);
  assert.ok(row);
  assert.match(row.id, UUID);
  assert.equal(row.job_name, 'billing.generate');
  assert.equal(row.trigger, 'cron');
  assert.equal(row.status, 'running');
  assert.equal(row.processed_count, 0);
  assert.equal(row.finished_at, null);
  assert.equal(row.error_message, null);
  assert.ok(row.started_at instanceof Date);
  assert.ok(row.created_at instanceof Date);
  assert.ok(row.updated_at instanceof Date);
});

test('RF-000-14: acepta todos los valores de trigger y status de la spec', async () => {
  for (const trigger of ['cron', 'external', 'manual', 'startup']) {
    for (const status of ['running', 'ok', 'error', 'skipped']) {
      await queryRows(db.connectionString, INSERT, ['billing.overdue', trigger, status]);
    }
  }
});

test('RF-000-14: un trigger fuera de la lista falla con job_runs_trigger_check', async () => {
  await rejectsWith(INSERT, ['billing.generate', 'webhook', 'running'], {
    code: '23514',
    constraint: 'job_runs_trigger_check',
  });
});

test('RF-000-14: un status fuera de la lista falla con job_runs_status_check', async () => {
  await rejectsWith(INSERT, ['billing.generate', 'cron', 'done'], {
    code: '23514',
    constraint: 'job_runs_status_check',
  });
});

test('RF-000-14: processed_count negativo falla con job_runs_processed_count_check', async () => {
  await rejectsWith(
    'INSERT INTO job_runs (job_name, trigger, status, processed_count) VALUES ($1, $2, $3, $4)',
    ['billing.generate', 'cron', 'ok', -1],
    { code: '23514', constraint: 'job_runs_processed_count_check' },
  );
});

test('RF-000-14: finished_at anterior a started_at falla con job_runs_finished_after_started_check', async () => {
  await rejectsWith(
    `INSERT INTO job_runs (job_name, trigger, status, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5)`,
    ['billing.generate', 'cron', 'ok', '2026-10-18T12:00:00Z', '2026-10-18T11:59:59Z'],
    { code: '23514', constraint: 'job_runs_finished_after_started_check' },
  );
});

test('RF-000-14: job_name NULL falla con not_null_violation', async () => {
  await rejectsWith(INSERT, [null, 'cron', 'running'], { code: '23502', column: 'job_name' });
});

test('RF-000-07: un UPDATE actualiza updated_at con el disparador set_updated_at', async () => {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    const old = '2020-01-01T00:00:00Z';
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO job_runs (job_name, trigger, status, created_at, updated_at)
       VALUES ('maintenance.cleanup', 'manual', 'running', $1, $1) RETURNING id`,
      [old],
    );
    const id = rows[0]?.id;
    assert.ok(id);
    const { rows: updated } = await client.query<{ updated_at: Date; created_at: Date }>(
      `UPDATE job_runs SET status = 'ok', finished_at = now(), processed_count = 3
       WHERE id = $1 RETURNING updated_at, created_at`,
      [id],
    );
    const row = updated[0];
    assert.ok(row);
    assert.ok(row.updated_at.getTime() > new Date(old).getTime(), 'updated_at debe avanzar');
    assert.equal(row.created_at.toISOString(), new Date(old).toISOString());

    const { rows: triggers } = await client.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'job_runs'::regclass AND NOT tgisinternal`,
    );
    assert.deepEqual(
      triggers.map((t) => t.tgname),
      ['job_runs_set_updated_at'],
    );
  } finally {
    await client.end();
  }
});

test('RF-000-14: existe el índice job_runs_name_started_idx sobre (job_name, started_at DESC)', async () => {
  const rows = await queryRows<{ indexdef: string }>(
    db.connectionString,
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'job_runs' AND indexname = 'job_runs_name_started_idx'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0]?.indexdef ?? '', /\(job_name, started_at DESC\)$/);
});
