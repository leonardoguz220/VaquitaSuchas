import { isValidIntervalSeconds, isValidJobName } from './domain/job-rules.js';
import type { ScheduledJob } from './scheduled-job.js';

/**
 * Registro central de tareas programadas. Cada módulo registra las suyas al arrancar (en su
 * `onModuleInit`), igual que los manejadores de `TxEventBus`.
 *
 * Un nombre repetido es un error de programación y lanza al registrar: de aceptarlo, dos tareas
 * distintas compartirían bloqueo asesor y una se omitiría siempre sin que nadie lo note.
 * No usa decoradores a propósito (ver `TxEventBus`); `JobsModule` la provee como clase.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, ScheduledJob>();

  register(job: ScheduledJob): void {
    if (!isValidJobName(job.name)) {
      throw new Error(
        'Nombre de tarea inválido: usa minúsculas con espacio de nombres, p. ej. "billing.generate".',
      );
    }
    if (!isValidIntervalSeconds(job.intervalSeconds)) {
      throw new Error(`La tarea "${job.name}" necesita intervalSeconds entero mayor o igual a 0.`);
    }
    if (this.jobs.has(job.name)) {
      throw new Error(`Ya existe una tarea registrada con el nombre "${job.name}".`);
    }
    this.jobs.set(job.name, job);
  }

  /** Tareas en orden de registro. Devuelve una copia: modificarla no altera el registro. */
  list(): ScheduledJob[] {
    return [...this.jobs.values()];
  }

  get(name: string): ScheduledJob | undefined {
    return this.jobs.get(name);
  }
}
