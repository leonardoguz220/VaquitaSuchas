import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { DomainError } from '../errors/domain-error.js';
import { JobsTickController } from './jobs-tick.controller.js';
import type { JobRunner } from './job-runner.js';

function setup(nodeEnv: string | undefined) {
  const runAll = jest.fn<JobRunner['runAll']>().mockResolvedValue([]);
  const config = { get: () => nodeEnv } as unknown as ConfigService;
  const controller = new JobsTickController({ runAll } as unknown as JobRunner, config);
  return { controller, runAll };
}

describe('JobsTickController: now simulado (RF-000-14)', () => {
  it.each(['development', 'test'])(
    'con NODE_ENV=%s pasa la fecha simulada al runner',
    async (env) => {
      const { controller, runAll } = setup(env);

      await controller.tick({ job: 'billing.generate', now: '2026-11-15' });

      expect(runAll).toHaveBeenCalledWith('external', {
        job: 'billing.generate',
        now: new Date('2026-11-15T12:00:00.000Z'),
      });
    },
  );

  it.each(['production', undefined, 'staging'])(
    'con NODE_ENV=%s rechaza ?now= con 400 y no ejecuta nada',
    async (env) => {
      const { controller, runAll } = setup(env);

      const error = await controller.tick({ now: '2026-11-15' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        httpStatus: 400,
        details: { fields: { now: ['NOT_ALLOWED_IN_PRODUCTION'] } },
      });
      expect(runAll).not.toHaveBeenCalled();
    },
  );

  it('en production un tick sin ?now= sigue funcionando', async () => {
    const { controller, runAll } = setup('production');

    await controller.tick({ job: 'billing.generate' });

    expect(runAll).toHaveBeenCalledWith('external', { job: 'billing.generate', now: undefined });
  });
});
