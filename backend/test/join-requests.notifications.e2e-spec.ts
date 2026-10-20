import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { NotificationsModule } from '../src/modules/notifications/notifications.module.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

// Spec 010 (T044): los avisos de la spec 005 parte A reaccionan a los eventos reales de la tarea
// join_requests.sweep. Requiere PostgreSQL.
describe('Avisos de solicitudes conectados a la tarea de plazos (spec 010 T044)', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule, NotificationsModule] });
  let group: TestGroup;
  let applicant: string;

  const at = (minutes: number): string =>
    new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
  const sweep = async (): Promise<void> => {
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.sweep' });
    expect(result).toMatchObject({ job: 'join_requests.sweep', status: 'ok' });
  };
  const noticesOf = async (userId: string, type: string): Promise<number> =>
    (
      await harness.pool.query('SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2', [
        userId,
        type,
      ])
    ).rowCount ?? 0;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    setClock(harness, '2030-01-01T00:00:00.000Z');
    await sweep();
    setClock(harness, NOW);
    await harness.pool.query('DELETE FROM notifications');
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-14: el recordatorio de 30 min llega al titular como aviso, una sola vez', async () => {
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    await harness.pool.query('UPDATE join_requests SET decision_deadline_at = $2 WHERE id = $1', [
      id,
      at(60),
    ]);

    setClock(harness, at(29));
    await sweep();
    expect(await noticesOf(group.ownerId, 'solicitud_recordatorio_30')).toBe(0);

    setClock(harness, at(30));
    await sweep();
    setClock(harness, at(45));
    await sweep();
    expect(await noticesOf(group.ownerId, 'solicitud_recordatorio_30')).toBe(1);
    expect(await noticesOf(applicant, 'solicitud_recordatorio_30')).toBe(0);
  });
});
