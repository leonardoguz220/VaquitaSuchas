import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { JobsCron } from './jobs-cron.js';
import type { JobRunner } from './job-runner.js';

function setup(inProcess: unknown) {
  const runAll = jest.fn<JobRunner['runAll']>(() => Promise.resolve([]));
  const config = { get: jest.fn(() => inProcess) } as unknown as ConfigService;
  const cron = new JobsCron({ runAll } as unknown as JobRunner, config);
  return { cron, runAll, config };
}

describe('JobsCron.handleTick', () => {
  it.each(['false', undefined, '', 'TRUE', '1'])(
    'RF-000-14: con JOBS_INPROCESS=%p no ejecuta ninguna tarea',
    async (value) => {
      const { cron, runAll } = setup(value);

      await cron.handleTick();

      expect(runAll).not.toHaveBeenCalled();
    },
  );

  it('RF-000-14: con JOBS_INPROCESS=true llama a runAll("cron")', async () => {
    const { cron, runAll, config } = setup('true');

    await cron.handleTick();

    expect(config.get).toHaveBeenCalledWith('JOBS_INPROCESS');
    expect(runAll).toHaveBeenCalledTimes(1);
    expect(runAll).toHaveBeenCalledWith('cron');
  });
});
