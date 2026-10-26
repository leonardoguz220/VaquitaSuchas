import 'reflect-metadata';
import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { DomainError } from '../errors/domain-error.js';
import { JobsTokenGuard } from '../guards/jobs-token.guard.js';
import { JobsTickController } from './jobs-tick.controller.js';
import type { JobRunner } from './job-runner.js';
import type { JobRunResult } from './scheduled-job.js';
import { TickRateLimitGuard } from './tick-rate-limit.guard.js';

function controllerWith(results: JobRunResult[], nodeEnv: string | undefined = 'test') {
  const runAll = jest.fn<JobRunner['runAll']>().mockResolvedValue(results);
  const config = { get: () => nodeEnv } as unknown as ConfigService;
  return {
    controller: new JobsTickController({ runAll } as unknown as JobRunner, config),
    runAll,
  };
}

describe('JobsTickController (RF-000-14)', () => {
  it('RF-000-14: delega en runAll con el disparador "external" y devuelve { ran }', async () => {
    const results: JobRunResult[] = [
      { job: 'example.noop', status: 'ok', processed: 0 },
      { job: 'maintenance.cleanup', status: 'skipped', reason: 'locked' },
    ];
    const { controller, runAll } = controllerWith(results);

    const response = await controller.tick({});

    expect(runAll).toHaveBeenCalledWith('external', { job: undefined });
    expect(response).toEqual({ ran: results });
  });

  it('RF-000-14: con ?job= ejecuta solo esa tarea', async () => {
    const { controller, runAll } = controllerWith([]);

    await controller.tick({ job: 'example.noop' });

    expect(runAll).toHaveBeenCalledWith('external', { job: 'example.noop' });
  });

  it('RF-000-14: responde 200 y no 201', () => {
    expect(Reflect.getMetadata('__httpCode__', JobsTickController.prototype.tick)).toBe(200);
  });

  it('RF-000-14: JobsTokenGuard va antes que el límite, para que un anónimo no gaste el cupo', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JobsTickController.prototype.tick,
    ) as unknown[];

    expect(guards).toEqual([JobsTokenGuard, TickRateLimitGuard]);
  });

  it.each(['development', 'test'])(
    'RF-000-14: con NODE_ENV=%s pasa el ?now= simulado al runner',
    async (env) => {
      const { controller, runAll } = controllerWith([], env);

      await controller.tick({ job: 'billing.generate', now: '2026-11-15' });

      expect(runAll).toHaveBeenCalledWith('external', {
        job: 'billing.generate',
        now: new Date('2026-11-15T12:00:00.000Z'),
      });
    },
  );

  it.each(['production', 'staging', undefined])(
    'RF-000-14: con NODE_ENV=%s rechaza ?now= con 400 y no ejecuta nada',
    async (env) => {
      const { controller, runAll } = controllerWith([], env);

      const error = await controller.tick({ now: '2026-11-15' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        httpStatus: 400,
        details: { fields: { now: ['NOT_ALLOWED_IN_PRODUCTION'] } },
      });
      expect(runAll).not.toHaveBeenCalled();
    },
  );

  it('RF-000-14: en production un tick sin ?now= sigue funcionando', async () => {
    const { controller, runAll } = controllerWith([], 'production');

    await controller.tick({ job: 'billing.generate' });

    expect(runAll).toHaveBeenCalledTimes(1);
  });
});
