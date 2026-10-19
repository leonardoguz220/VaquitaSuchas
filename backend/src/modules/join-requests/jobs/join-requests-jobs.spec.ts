import { JoinRequestsRetentionJob, JoinRequestsSweepJob } from './join-requests-jobs.js';

describe('tareas de join-requests', () => {
  it('CA-010-09: el barrido corre en cada tick', () => {
    const job = new JoinRequestsSweepJob({} as never);
    expect(job.name).toBe('join-requests.sweep');
    expect(job.intervalSeconds).toBe(0);
  });

  it('CA-010-44: la retención corre una vez al día y falla si algo no se pudo limpiar', async () => {
    const retention = { purgeExpired: () => Promise.resolve({ purged: 2, failed: 1 }) };
    const job = new JoinRequestsRetentionJob(retention as never);
    expect(job.name).toBe('join-requests.retention');
    expect(job.intervalSeconds).toBe(86_400);
    await expect(job.run({ now: new Date() } as never)).rejects.toThrow(/1 elemento/);
  });
});
