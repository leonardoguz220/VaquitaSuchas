import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { isInProcessEnabled } from './domain/job-rules.js';
import { JobRunner } from './job-runner.js';

/**
 * Disparador interno: cada minuto llama a `runAll('cron')`, pero solo si `JOBS_INPROCESS=true`.
 * Con `false` (p. ej. Render gratuito, que se duerme) el tick llega por `POST /internal/jobs/tick`.
 * `JobsModule` ni siquiera registra este cron cuando la variable no es `true`; la comprobación
 * del handler es la segunda barrera. `@nestjs/schedule` captura los errores del handler, y
 * `runAll` tampoco lanza.
 */
@Injectable()
export class JobsCron {
  constructor(
    private readonly runner: JobRunner,
    private readonly config: ConfigService,
  ) {}

  @Cron('* * * * *')
  async handleTick(): Promise<void> {
    if (!isInProcessEnabled(this.config.get('JOBS_INPROCESS'))) {
      return;
    }
    await this.runner.runAll('cron');
  }
}
