import { jest } from '@jest/globals';
import type { DbService } from '../../../shared/db/db.service.js';
import { isValidJobName } from '../../../shared/jobs/domain/job-rules.js';
import type { JobContext } from '../../../shared/jobs/scheduled-job.js';
import { UnverifiedUsersRepository } from '../repositories/unverified-users.repository.js';
import { PurgeUnverifiedJob } from './purge-unverified.job.js';

const ctx = (now: Date): JobContext => ({ now, trigger: 'cron', db: {} as unknown as DbService });

describe('PurgeUnverifiedJob', () => {
  it('RF-003-04: borra las cuentas sin verificar creadas antes de now - 24 h', async () => {
    const deleteCreatedBefore = jest.fn<(c: Date) => Promise<number>>(() => Promise.resolve(3));
    const job = new PurgeUnverifiedJob({
      deleteCreatedBefore,
    } as unknown as UnverifiedUsersRepository);

    await expect(job.run(ctx(new Date('2026-10-19T12:00:00Z')))).resolves.toBe(3);
    expect(deleteCreatedBefore).toHaveBeenCalledWith(new Date('2026-10-18T12:00:00Z'));
  });

  it('RF-003-04: el SQL solo toca cuentas sin verificar', async () => {
    const query = jest.fn(() => Promise.resolve({ rowCount: 2 }));
    const repo = new UnverifiedUsersRepository({ query } as unknown as DbService);
    await expect(repo.deleteCreatedBefore(new Date(0))).resolves.toBe(2);
    expect((query.mock.calls[0] as unknown as [string])[0]).toContain('verified_at IS NULL');
  });

  it('RF-003-04: tiene nombre válido, corre cada hora y es idempotente (sin coincidencias → 0)', async () => {
    const repo = {
      deleteCreatedBefore: () => Promise.resolve(0),
    } as unknown as UnverifiedUsersRepository;
    const job = new PurgeUnverifiedJob(repo);
    expect(isValidJobName(job.name)).toBe(true);
    expect(job.intervalSeconds).toBe(3600);
    await expect(job.run(ctx(new Date()))).resolves.toBe(0);
  });
});
