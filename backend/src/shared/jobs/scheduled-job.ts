import type { DbService } from '../db/db.service.js';

/** Quién disparó la ejecución. Coincide con el CHECK de `job_runs.trigger`. */
export type JobTrigger = 'cron' | 'external' | 'manual' | 'startup';

/**
 * Lo mínimo que recibe una tarea. `now` viene del `Clock` inyectado: una tarea nunca debe leer
 * el reloj global. `db` es para abrir transacciones (`db.withTransaction`) desde la tarea; el SQL
 * sigue viviendo en los repositorios.
 */
export interface JobContext {
  readonly now: Date;
  readonly trigger: JobTrigger;
  readonly db: DbService;
}

/**
 * Tarea programada (RF-000-14). Sin NestJS: cada módulo crea la suya y la registra en
 * `JobRegistry` desde su `onModuleInit`.
 *
 * - `name`: único, con espacio de nombres (`billing.generate`); es también la clave del bloqueo asesor.
 * - `intervalSeconds`: separación mínima entre dos ejecuciones EXITOSAS; 0 = en cada disparo.
 * - `run`: devuelve cuántos elementos procesó. Debe ser idempotente: decide qué falta por hacer
 *   según el estado de la base, no según el tiempo desde la última vez. Si lanza, la ejecución
 *   queda en `error` y el resto de tareas sigue.
 */
export interface ScheduledJob {
  readonly name: string;
  readonly intervalSeconds: number;
  run(ctx: JobContext): Promise<number>;
}

export type JobSkipReason = 'locked' | 'interval';

/** Resultado por tarea. Es lo que `POST /internal/jobs/tick` (T029) traduce a su respuesta. */
export type JobRunResult =
  | { readonly job: string; readonly status: 'ok'; readonly processed: number }
  | { readonly job: string; readonly status: 'error'; readonly error: string }
  | { readonly job: string; readonly status: 'skipped'; readonly reason: JobSkipReason };

export interface RunAllOptions {
  /** Ejecuta solo la tarea con este nombre (`?job=` del tick). Si no existe, el resultado es vacío. */
  readonly job?: string;
  /** Ignora `intervalSeconds` (p. ej. una ejecución pedida a mano). Por omisión no se ignora. */
  readonly ignoreInterval?: boolean;
  /**
   * Fecha simulada: es la `ctx.now` que ven las tareas (`?now=` del tick, solo fuera de producción).
   * Implica ignorar `intervalSeconds`; `job_runs` sigue guardando la hora real.
   */
  readonly now?: Date;
}
