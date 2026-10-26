import { Global, Module, Optional, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { FileStorage } from '../ports/file-storage.js';
import { isInProcessEnabled } from './domain/job-rules.js';
import { JobRegistry } from './job-registry.js';
import { JobRunner } from './job-runner.js';
import { JobRunsRepository } from './job-runs.repository.js';
import { JobsCron } from './jobs-cron.js';
import { MaintenanceCleanupRepository } from './maintenance-cleanup.repository.js';
import { ExampleNoopJob } from './tasks/example-noop.job.js';
import { MaintenanceCleanupJob } from './tasks/maintenance-cleanup.job.js';

// Global para que cualquier módulo inyecte `JobRegistry` (y registre sus tareas en su
// `onModuleInit`) sin importar este. DbService y Clock llegan de sus módulos globales.
@Global()
@Module({
  imports: [
    ScheduleModule.forRootAsync({
      inject: [ConfigService],
      // Sin JOBS_INPROCESS=true no se monta ningún cron: no hay temporizadores vivos en pruebas
      // ni en Render. Intervalos y timeouts de @nestjs/schedule no se usan en el proyecto.
      useFactory: (config: ConfigService) => ({
        cronJobs: isInProcessEnabled(config.get('JOBS_INPROCESS')),
        intervals: false,
        timeouts: false,
      }),
    }),
  ],
  providers: [JobRegistry, JobRunner, JobRunsRepository, MaintenanceCleanupRepository, JobsCron],
  exports: [JobRegistry, JobRunner, JobRunsRepository],
})
export class JobsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly cleanupRepository: MaintenanceCleanupRepository,
    @Optional() private readonly storage?: FileStorage,
  ) {}

  onModuleInit(): void {
    this.registry.register(new ExampleNoopJob());
    this.registry.register(new MaintenanceCleanupJob(this.cleanupRepository, this.storage));
  }
}
