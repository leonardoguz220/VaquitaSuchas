import { jest } from '@jest/globals';
import type { FileStorage } from '../../ports/file-storage.js';
import type { DbService } from '../../db/db.service.js';
import type { MaintenanceCleanupRepository } from '../maintenance-cleanup.repository.js';
import type { JobContext } from '../scheduled-job.js';
import { ExampleNoopJob } from './example-noop.job.js';
import { MaintenanceCleanupJob } from './maintenance-cleanup.job.js';

type Delete = jest.Mock<(cutoff: Date) => Promise<number>>;

function fakeRepository(counts: [number, number, number] = [0, 0, 0]) {
  const deleteJobRunsBefore: Delete = jest.fn(() => Promise.resolve(counts[0]));
  const deleteRateLimitEventsBefore: Delete = jest.fn(() => Promise.resolve(counts[1]));
  const deleteTelegramUpdatesBefore: Delete = jest.fn(() => Promise.resolve(counts[2]));
  return {
    deleteJobRunsBefore,
    deleteRateLimitEventsBefore,
    deleteTelegramUpdatesBefore,
    asRepository: () =>
      ({
        deleteJobRunsBefore,
        deleteRateLimitEventsBefore,
        deleteTelegramUpdatesBefore,
      }) as unknown as MaintenanceCleanupRepository,
  };
}

const ctx = (now: Date): JobContext => ({ now, trigger: 'cron', db: {} as unknown as DbService });

describe('MaintenanceCleanupJob', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('RF-000-14: borra con los tres cortes calculados desde el now del contexto y suma los borrados', async () => {
    const repo = fakeRepository([5, 7, 11]);

    const total = await new MaintenanceCleanupJob(repo.asRepository()).run(ctx(now));

    expect(total).toBe(23);
    expect(repo.deleteJobRunsBefore).toHaveBeenCalledWith(new Date('2026-05-16T12:00:00.000Z'));
    expect(repo.deleteRateLimitEventsBefore).toHaveBeenCalledWith(
      new Date('2026-06-14T12:00:00.000Z'),
    );
    expect(repo.deleteTelegramUpdatesBefore).toHaveBeenCalledWith(
      new Date('2026-06-08T12:00:00.000Z'),
    );
  });

  it('RF-000-14: si una tabla falla, las demás igual se limpian y se relanza el primer error', async () => {
    const repo = fakeRepository([1, 1, 1]);
    const failure = Object.assign(new Error('append-only table'), { code: '23001' });
    repo.deleteRateLimitEventsBefore.mockRejectedValueOnce(failure);

    await expect(new MaintenanceCleanupJob(repo.asRepository()).run(ctx(now))).rejects.toBe(
      failure,
    );

    expect(repo.deleteJobRunsBefore).toHaveBeenCalledTimes(1);
    expect(repo.deleteTelegramUpdatesBefore).toHaveBeenCalledTimes(1);
  });

  it('RF-000-14: es una tarea con nombre e intervalo válidos', () => {
    const job = new MaintenanceCleanupJob(fakeRepository().asRepository());

    expect(job.name).toBe('maintenance.cleanup');
    expect(job.intervalSeconds).toBeGreaterThan(0);
  });
});

describe('ExampleNoopJob', () => {
  it('RF-000-14: no hace nada y devuelve 0', async () => {
    const job = new ExampleNoopJob();

    expect(job.name).toBe('example.noop');
    await expect(job.run()).resolves.toBe(0);
  });

  it('T049 (MaintenanceCleanupJob): con almacén hace una lectura de mantenimiento y un fallo del almacén no rompe la limpieza', async () => {
    const repo = fakeRepository([1, 1, 1]);
    const exists = jest.fn<(key: string) => Promise<boolean>>(() =>
      Promise.reject(new Error('storage down')),
    );
    const storage = { exists } as unknown as FileStorage;
    const now = new Date('2026-06-15T12:00:00.000Z');

    const total = await new MaintenanceCleanupJob(repo.asRepository(), storage).run(ctx(now));

    expect(total).toBe(3);
    expect(exists).toHaveBeenCalledTimes(1);
  });
});
