import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import type { ShortfallSweeper } from '../services/shortfall-sweeper.js';

/**
 * `shortfalls.sweep` (spec 011, contracts/api.md): en cada tick persiste los plazos vencidos y
 * cierra las rondas resueltas. Idempotente: decide por el estado de la base. Devuelve cuántas filas
 * pasaron a devolución más cuántas rondas se cerraron; si alguna ronda falló, la ejecución queda en
 * `error` (las demás igual se procesan).
 */
export class ShortfallsSweepJob implements ScheduledJob {
  readonly name = 'shortfalls.sweep';
  readonly intervalSeconds = 0;

  constructor(private readonly sweeper: ShortfallSweeper) {}

  async run(ctx: JobContext): Promise<number> {
    const { expired, closed, failed } = await this.sweeper.sweep(ctx.now);
    if (failed > 0) throw new Error(`shortfalls.sweep no pudo procesar ${failed} ronda(s).`);
    return expired + closed;
  }
}
