import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { DbService } from '../db/db.service.js';
import { describeJobError, isJobDue } from './domain/job-rules.js';
import { JobRegistry } from './job-registry.js';
import { JobRunsRepository, type JobRunOutcome } from './job-runs.repository.js';
import type { JobRunResult, JobTrigger, RunAllOptions, ScheduledJob } from './scheduled-job.js';

/**
 * Ejecuta las tareas registradas (RF-000-14). Lo llaman el cron interno (`JobsCron`) y el
 * endpoint `POST /internal/jobs/tick` (T029).
 *
 * Por cada tarea, en serie y en orden de registro:
 * 1. Toma el bloqueo asesor de sesión `hashtext(name)`; si otra ejecución lo tiene -> `skipped/locked`.
 * 2. Si su última ejecución exitosa fue hace menos de `intervalSeconds` -> `skipped/interval`.
 * 3. Inserta la fila `running`, ejecuta `run(ctx)` y la cierra como `ok` o `error`.
 * 4. Libera el bloqueo siempre (`finally` de `DbService.withAdvisoryLock`).
 *
 * `runAll` nunca lanza: un fallo de una tarea (o de la base) se devuelve como `error` y no impide
 * que corran las siguientes. Las omisiones (`skipped`) no se guardan en `job_runs`: con el cron
 * cada minuto llenarían la tabla y la ejecución que sí corre ya deja su propia fila.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly runs: JobRunsRepository,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  async runAll(trigger: JobTrigger, options: RunAllOptions = {}): Promise<JobRunResult[]> {
    const jobs = this.registry
      .list()
      .filter((job) => options.job === undefined || job.name === options.job);
    const results: JobRunResult[] = [];
    for (const job of jobs) {
      results.push(await this.runOne(job, trigger, options));
    }
    return results;
  }

  private async runOne(
    job: ScheduledJob,
    trigger: JobTrigger,
    options: RunAllOptions,
  ): Promise<JobRunResult> {
    try {
      const locked = await this.db.withAdvisoryLock(job.name, () =>
        this.runLocked(job, trigger, options),
      );
      return locked.acquired
        ? locked.value
        : { job: job.name, status: 'skipped', reason: 'locked' };
    } catch (error) {
      // Fallo de infraestructura (base caída al bloquear, al abrir o al cerrar la fila).
      return this.failure(job, error);
    }
  }

  private async runLocked(
    job: ScheduledJob,
    trigger: JobTrigger,
    options: RunAllOptions,
  ): Promise<JobRunResult> {
    const startedAt = this.clock.now();
    // Con fecha simulada la tarea ve esa fecha, pero la fila de `job_runs` y el freno de cadencia
    // usan la hora real: una fecha futura no debe bloquear los ticks reales que vengan después.
    const taskNow = options.now ?? startedAt;
    const ignoreInterval = options.ignoreInterval === true || options.now !== undefined;

    if (!ignoreInterval && job.intervalSeconds > 0) {
      const lastOk = await this.runs.findLastOkStartedAt(job.name);
      if (!isJobDue(lastOk, startedAt, job.intervalSeconds)) {
        return { job: job.name, status: 'skipped', reason: 'interval' };
      }
    }

    const runId = await this.runs.insertRunning(job.name, trigger, startedAt);

    let outcome: JobRunOutcome;
    let result: JobRunResult;
    try {
      const processed = await job.run({ now: taskNow, trigger, db: this.db });
      if (!Number.isSafeInteger(processed) || processed < 0) {
        throw new TypeError('La tarea debe devolver un entero mayor o igual a 0.');
      }
      outcome = { status: 'ok', processedCount: processed };
      result = { job: job.name, status: 'ok', processed };
    } catch (error) {
      const description = describeJobError(error);
      this.logFailure(job, description);
      outcome = { status: 'error', errorMessage: description };
      result = { job: job.name, status: 'error', error: description };
    }

    await this.runs.finish(runId, outcome, this.clock.now());
    return result;
  }

  private failure(job: ScheduledJob, error: unknown): JobRunResult {
    const description = describeJobError(error);
    this.logFailure(job, description);
    return { job: job.name, status: 'error', error: description };
  }

  // Solo nombre de la tarea y tipo de error: el mensaje de la excepción puede traer datos personales.
  private logFailure(job: ScheduledJob, description: string): void {
    this.logger.error(`La tarea "${job.name}" falló: ${description}.`);
  }
}
