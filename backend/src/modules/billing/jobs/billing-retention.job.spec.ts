import type { JobContext } from '../../../shared/jobs/scheduled-job.js';
import type { RetentionService } from '../services/retention.service.js';
import { BillingRetentionJob } from './billing-jobs.js';

const ctx = { now: new Date('2026-10-16T15:00:00Z'), trigger: 'manual' } as unknown as JobContext;
const service = (result: { deleted: number; failed: number }): RetentionService =>
  ({ purgeExpiredReceipts: () => Promise.resolve(result) }) as unknown as RetentionService;

describe('BillingRetentionJob (RN-002-06)', () => {
  it('CA-002-33: se llama billing.retention y corre una vez al día', () => {
    const job = new BillingRetentionJob(service({ deleted: 0, failed: 0 }));
    expect(job.name).toBe('billing.retention');
    expect(job.intervalSeconds).toBe(86_400);
  });

  it('CA-002-33: devuelve cuántos archivos borró', async () => {
    await expect(
      new BillingRetentionJob(service({ deleted: 3, failed: 0 })).run(ctx),
    ).resolves.toBe(3);
  });

  it('CA-002-33: si algún archivo falló lanza para que la ejecución quede en error', async () => {
    await expect(
      new BillingRetentionJob(service({ deleted: 2, failed: 1 })).run(ctx),
    ).rejects.toThrow('no pudo borrar 1 archivo(s)');
  });
});
