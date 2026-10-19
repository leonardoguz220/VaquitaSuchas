import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { FakeClock } from '../clock/fake-clock.js';
import type { AdvisoryLockResult, DbService } from '../db/db.service.js';
import { JobRegistry } from './job-registry.js';
import { JobRunner } from './job-runner.js';
import type { JobRunOutcome, JobRunsRepository } from './job-runs.repository.js';
import type { JobContext, JobTrigger, ScheduledJob } from './scheduled-job.js';

interface Row {
  id: string;
  jobName: string;
  trigger: JobTrigger;
  status: 'running' | 'ok' | 'error';
  startedAt: Date;
  finishedAt: Date | null;
  processedCount: number;
  errorMessage: string | null;
}

/** Doble en memoria de JobRunsRepository. */
class FakeRuns {
  readonly rows: Row[] = [];

  insertRunning(jobName: string, trigger: JobTrigger, startedAt: Date): Promise<string> {
    const id = `run-${this.rows.length + 1}`;
    this.rows.push({
      id,
      jobName,
      trigger,
      status: 'running',
      startedAt,
      finishedAt: null,
      processedCount: 0,
      errorMessage: null,
    });
    return Promise.resolve(id);
  }

  finish(id: string, outcome: JobRunOutcome, finishedAt: Date): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id) as Row;
    row.status = outcome.status;
    row.finishedAt = finishedAt;
    row.processedCount = outcome.status === 'ok' ? outcome.processedCount : 0;
    row.errorMessage = outcome.status === 'error' ? outcome.errorMessage : null;
    return Promise.resolve();
  }

  findLastOkStartedAt(jobName: string): Promise<Date | null> {
    const oks = this.rows
      .filter((row) => row.jobName === jobName && row.status === 'ok')
      .map((row) => row.startedAt.getTime());
    return Promise.resolve(oks.length === 0 ? null : new Date(Math.max(...oks)));
  }
}

/** Doble de DbService: los nombres en `locked` simulan otra instancia con el bloqueo. */
class FakeDb {
  readonly locked = new Set<string>();
  readonly held = new Set<string>();
  readonly released: string[] = [];
  failToLock = false;

  async withAdvisoryLock<T>(name: string, fn: () => Promise<T>): Promise<AdvisoryLockResult<T>> {
    if (this.failToLock) {
      throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), {
        code: 'ECONNREFUSED',
      });
    }
    if (this.locked.has(name)) {
      return { acquired: false };
    }
    this.held.add(name);
    try {
      return { acquired: true, value: await fn() };
    } finally {
      this.held.delete(name);
      this.released.push(name);
    }
  }
}

function setup() {
  const registry = new JobRegistry();
  const runs = new FakeRuns();
  const db = new FakeDb();
  const clock = new FakeClock('2026-03-10T12:00:00.000Z');
  const runner = new JobRunner(
    registry,
    runs as unknown as JobRunsRepository,
    db as unknown as DbService,
    clock,
  );
  return { registry, runs, db, clock, runner };
}

function job(
  name: string,
  run: (ctx: JobContext) => Promise<number> = () => Promise.resolve(0),
  intervalSeconds = 0,
): ScheduledJob & { run: jest.Mock<(ctx: JobContext) => Promise<number>> } {
  return { name, intervalSeconds, run: jest.fn(run) };
}

describe('JobRunner.runAll', () => {
  let logError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    // Los fallos se registran con Logger; se capturan para no ensuciar la salida y para inspeccionarlos.
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('RF-000-14: una tarea que termina bien deja la fila running -> ok con su conteo', async () => {
    const { registry, runs, runner, clock } = setup();
    const seenWhileRunning: string[] = [];
    registry.register(
      job('billing.generate', () => {
        seenWhileRunning.push(...runs.rows.map((row) => row.status));
        clock.advance(2500);
        return Promise.resolve(3);
      }),
    );

    const results = await runner.runAll('cron');

    expect(results).toEqual([{ job: 'billing.generate', status: 'ok', processed: 3 }]);
    expect(seenWhileRunning).toEqual(['running']);
    expect(runs.rows).toEqual([
      {
        id: 'run-1',
        jobName: 'billing.generate',
        trigger: 'cron',
        status: 'ok',
        startedAt: new Date('2026-03-10T12:00:00.000Z'),
        finishedAt: new Date('2026-03-10T12:00:02.500Z'),
        processedCount: 3,
        errorMessage: null,
      },
    ]);
  });

  it('RF-000-14: la tarea recibe el now del Clock, el trigger y el DbService', async () => {
    const { registry, runner, db } = setup();
    const billing = job('billing.generate');
    registry.register(billing);

    await runner.runAll('external');

    expect(billing.run).toHaveBeenCalledWith({
      now: new Date('2026-03-10T12:00:00.000Z'),
      trigger: 'external',
      db,
    });
  });

  it('RF-000-14: si una tarea lanza, queda en error, la siguiente corre y runAll no lanza', async () => {
    const { registry, runs, runner } = setup();
    const failing = job('billing.generate', () =>
      Promise.reject(new Error('fallo con ana@example.com')),
    );
    const next = job('billing.overdue', () => Promise.resolve(2));
    registry.register(failing);
    registry.register(next);

    const results = await runner.runAll('cron');

    expect(results).toEqual([
      { job: 'billing.generate', status: 'error', error: 'Error' },
      { job: 'billing.overdue', status: 'ok', processed: 2 },
    ]);
    expect(next.run).toHaveBeenCalledTimes(1);
    expect(runs.rows.map((row) => [row.jobName, row.status])).toEqual([
      ['billing.generate', 'error'],
      ['billing.overdue', 'ok'],
    ]);
  });

  it('RF-000-14: el error guardado y el devuelto no incluyen el mensaje ni datos personales', async () => {
    const { registry, runs, runner } = setup();
    registry.register(
      job('billing.generate', () =>
        Promise.reject(Object.assign(new Error('cédula 1234567'), { code: '23505' })),
      ),
    );

    const results = await runner.runAll('cron');

    expect(runs.rows[0]?.errorMessage).toBe('Error (23505)');
    expect(JSON.stringify(results)).not.toContain('1234567');
    expect(runs.rows[0]?.processedCount).toBe(0);
  });

  it('RF-000-14: el log del fallo lleva solo el nombre de la tarea y el tipo de error', async () => {
    const { registry, runner } = setup();
    registry.register(
      job('billing.generate', () => Promise.reject(new Error('cédula 1234567 de ana@example.com'))),
    );

    await runner.runAll('cron');

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('La tarea "billing.generate" falló: Error.');
  });

  it('RF-000-14: libera el bloqueo aunque la tarea falle', async () => {
    const { registry, db, runner } = setup();
    registry.register(job('billing.generate', () => Promise.reject(new Error('x'))));

    await runner.runAll('cron');

    expect(db.released).toEqual(['billing.generate']);
    expect(db.held.size).toBe(0);
  });

  it('RF-000-14: sin bloqueo devuelve skipped/locked, no ejecuta la tarea ni escribe en job_runs', async () => {
    const { registry, runs, db, runner } = setup();
    const locked = job('billing.generate');
    const free = job('billing.overdue');
    registry.register(locked);
    registry.register(free);
    db.locked.add('billing.generate');

    const results = await runner.runAll('external');

    expect(results).toEqual([
      { job: 'billing.generate', status: 'skipped', reason: 'locked' },
      { job: 'billing.overdue', status: 'ok', processed: 0 },
    ]);
    expect(locked.run).not.toHaveBeenCalled();
    expect(runs.rows.map((row) => row.jobName)).toEqual(['billing.overdue']);
  });

  it('RF-000-14: respeta intervalSeconds con el Clock: omite antes del intervalo y ejecuta al cumplirse', async () => {
    const { registry, runs, runner, clock } = setup();
    const hourly = job('maintenance.cleanup', () => Promise.resolve(1), 3600);
    registry.register(hourly);

    const first = await runner.runAll('cron');
    clock.advance(3599 * 1000);
    const early = await runner.runAll('cron');
    clock.advance(1000);
    const due = await runner.runAll('cron');

    expect(first).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 1 }]);
    expect(early).toEqual([{ job: 'maintenance.cleanup', status: 'skipped', reason: 'interval' }]);
    expect(due).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 1 }]);
    expect(hourly.run).toHaveBeenCalledTimes(2);
    expect(runs.rows).toHaveLength(2);
  });

  it('RF-000-14: una ejecución fallida no cuenta para el intervalo: se reintenta en el siguiente disparo', async () => {
    const { registry, runner } = setup();
    const flaky = job('billing.generate', () => Promise.reject(new Error('x')), 3600);
    registry.register(flaky);

    await runner.runAll('cron');
    const retry = await runner.runAll('cron');

    expect(retry).toEqual([{ job: 'billing.generate', status: 'error', error: 'Error' }]);
    expect(flaky.run).toHaveBeenCalledTimes(2);
  });

  it('RF-000-14: ignoreInterval ejecuta aunque no haya pasado el intervalo', async () => {
    const { registry, runner } = setup();
    const hourly = job('maintenance.cleanup', () => Promise.resolve(0), 3600);
    registry.register(hourly);

    await runner.runAll('manual');
    const forced = await runner.runAll('manual', { ignoreInterval: true });

    expect(forced).toEqual([{ job: 'maintenance.cleanup', status: 'ok', processed: 0 }]);
    expect(hourly.run).toHaveBeenCalledTimes(2);
  });

  it('RF-000-14: la opción job ejecuta solo esa tarea y un nombre desconocido da lista vacía', async () => {
    const { registry, runner } = setup();
    const one = job('billing.generate');
    const two = job('billing.overdue');
    registry.register(one);
    registry.register(two);

    const only = await runner.runAll('external', { job: 'billing.overdue' });
    const unknown = await runner.runAll('external', { job: 'no.existe' });

    expect(only).toEqual([{ job: 'billing.overdue', status: 'ok', processed: 0 }]);
    expect(one.run).not.toHaveBeenCalled();
    expect(unknown).toEqual([]);
  });

  it('RF-000-14: un fallo de la base al bloquear se devuelve como error y no impide seguir ni lanza', async () => {
    const { registry, db, runner } = setup();
    registry.register(job('billing.generate'));
    db.failToLock = true;

    const results = await runner.runAll('cron');

    expect(results).toEqual([
      { job: 'billing.generate', status: 'error', error: 'Error (ECONNREFUSED)' },
    ]);
  });

  it('RF-000-14: un resultado que no es un entero >= 0 se trata como error', async () => {
    const { registry, runs, runner } = setup();
    registry.register(job('billing.generate', () => Promise.resolve(-1)));

    const results = await runner.runAll('cron');

    expect(results).toEqual([{ job: 'billing.generate', status: 'error', error: 'TypeError' }]);
    expect(runs.rows[0]?.status).toBe('error');
  });

  it('RF-000-14: sin tareas registradas devuelve una lista vacía', async () => {
    const { runner } = setup();

    await expect(runner.runAll('cron')).resolves.toEqual([]);
  });
});
