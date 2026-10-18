import type { ScheduledJob } from '../scheduled-job.js';

/**
 * Tarea de ejemplo (RF-000-14): no hace nada y devuelve 0. Sirve como plantilla de tarea
 * idempotente y para probar el runner y el tick sin tocar datos.
 */
export class ExampleNoopJob implements ScheduledJob {
  readonly name = 'example.noop';
  readonly intervalSeconds = 3600;

  run(): Promise<number> {
    return Promise.resolve(0);
  }
}
