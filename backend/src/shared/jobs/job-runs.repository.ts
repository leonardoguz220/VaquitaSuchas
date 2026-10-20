import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import type { JobTrigger } from './scheduled-job.js';

export type JobRunOutcome =
  | { readonly status: 'ok'; readonly processedCount: number }
  | { readonly status: 'error'; readonly errorMessage: string };

/** Único lugar con SQL sobre `job_runs` (0002_job_runs.sql). Las fechas llegan del `Clock`. */
@Injectable()
export class JobRunsRepository {
  constructor(private readonly db: DbService) {}

  /** Abre la ejecución: fila `running`. Devuelve su id. */
  async insertRunning(jobName: string, trigger: JobTrigger, startedAt: Date): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO job_runs (job_name, trigger, status, started_at)
       VALUES ($1, $2, 'running', $3)
       RETURNING id`,
      [jobName, trigger, startedAt],
    );
    return (result.rows[0] as { id: string }).id;
  }

  /** Cierra la ejecución como `ok` o `error`. `errorMessage` ya viene acotado y sin datos personales. */
  async finish(id: string, outcome: JobRunOutcome, finishedAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE job_runs
          SET status = $2,
              finished_at = $3,
              processed_count = $4,
              error_message = COALESCE($5, error_message)
        WHERE id = $1`,
      [
        id,
        outcome.status,
        finishedAt,
        outcome.status === 'ok' ? outcome.processedCount : 0,
        outcome.status === 'error' ? outcome.errorMessage : null,
      ],
    );
  }

  /**
   * Deja una advertencia en la ejecución en curso (`running`) de la tarea. `finish` la conserva
   * si la ejecución termina en `ok` (columna `error_message`), así que el mensaje debe ser breve
   * y sin datos personales.
   */
  async addWarning(jobName: string, startedAt: Date, message: string): Promise<void> {
    await this.db.query(
      `UPDATE job_runs SET error_message = $3
        WHERE id = (SELECT id FROM job_runs
                     WHERE job_name = $1 AND status = 'running' AND started_at = $2
                     ORDER BY created_at DESC LIMIT 1)`,
      [jobName, startedAt, message.slice(0, 500)],
    );
  }

  /** Inicio de la última ejecución exitosa de la tarea, o `null` si nunca terminó bien. */
  async findLastOkStartedAt(jobName: string): Promise<Date | null> {
    const result = await this.db.query<{ started_at: Date }>(
      `SELECT started_at
         FROM job_runs
        WHERE job_name = $1 AND status = 'ok'
        ORDER BY started_at DESC
        LIMIT 1`,
      [jobName],
    );
    return result.rows[0]?.started_at ?? null;
  }
}
