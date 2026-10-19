import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { ClockModule } from '../clock/clock.module.js';
import { DbService } from '../db/db.service.js';
import { JobRegistry } from './job-registry.js';
import { JobRunner } from './job-runner.js';
import { JobsModule } from './jobs.module.js';

// DbService de mentira: estas pruebas solo miran el cableado, no consultan la base.
@Global()
@Module({
  providers: [{ provide: DbService, useValue: {} }],
  exports: [DbService],
})
class FakeDbModule {}

// ConfigService da prioridad a process.env sobre `load`, así que la variable se fija en el entorno.
const originalInProcess = process.env['JOBS_INPROCESS'];

async function createContext(inProcess: string | undefined) {
  if (inProcess === undefined) {
    delete process.env['JOBS_INPROCESS'];
  } else {
    process.env['JOBS_INPROCESS'] = inProcess;
  }
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
      ClockModule,
      FakeDbModule,
      JobsModule,
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('JobsModule', () => {
  afterEach(() => {
    if (originalInProcess === undefined) {
      delete process.env['JOBS_INPROCESS'];
    } else {
      process.env['JOBS_INPROCESS'] = originalInProcess;
    }
  });

  it('RF-000-14: registra example.noop y maintenance.cleanup al arrancar', async () => {
    const moduleRef = await createContext('false');

    try {
      expect(
        moduleRef
          .get(JobRegistry)
          .list()
          .map((job) => job.name),
      ).toEqual(['example.noop', 'maintenance.cleanup']);
      expect(moduleRef.get(JobRunner)).toBeInstanceOf(JobRunner);
    } finally {
      await moduleRef.close();
    }
  });

  it.each(['false', undefined])(
    'RF-000-14: con JOBS_INPROCESS=%p no queda ningún cron vivo',
    async (value) => {
      const moduleRef = await createContext(value);

      try {
        expect(moduleRef.get(SchedulerRegistry).getCronJobs().size).toBe(0);
      } finally {
        await moduleRef.close();
      }
    },
  );

  it('RF-000-14: con JOBS_INPROCESS=true monta el cron de cada minuto y lo detiene al cerrar', async () => {
    const moduleRef = await createContext('true');
    const schedulerRegistry = moduleRef.get(SchedulerRegistry);

    const jobs = [...schedulerRegistry.getCronJobs().values()];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.isActive).toBe(true);

    await moduleRef.close();

    expect(jobs[0]?.isActive).toBe(false);
    expect(schedulerRegistry.getCronJobs().size).toBe(0);
  });
});
