import { NotificationsModule } from '../src/modules/notifications/notifications.module.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Spec 002 (T041): los avisos de la spec 005 parte A reaccionan a los eventos reales del barrido
// de atrasos. Requiere PostgreSQL. NOW = 2026-10-16T15:00Z.
const OVERDUE = '2026-10-16T10:00:00.000Z';

describe('Avisos de cobros conectados al barrido de atrasos (spec 002 T041)', () => {
  const harness = new BillingHarness({ imports: [NotificationsModule] });
  let runner: JobRunner;
  let group: TestGroup;
  let memberA: string;

  const notices = async (userId: string): Promise<{ type: string; body: string }[]> =>
    (
      await harness.pool.query<{ type: string; body: string }>(
        'SELECT type, body FROM notifications WHERE user_id = $1 ORDER BY created_at, id',
        [userId],
      )
    ).rows;

  beforeAll(async () => {
    await harness.start();
    runner = harness.app.get(JobRunner, { strict: false });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  beforeEach(async () => {
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE status = 'activo'",
    );
    await harness.pool.query('DELETE FROM notification_deliveries');
    await harness.pool.query('DELETE FROM notifications');
    group = await harness.createGroup({ members: 2 });
    [memberA] = group.memberIds as [string, string];
  });

  it('CA-002-28: el retiro por mora avisa al miembro y al titular, una vez por cobro', async () => {
    await harness.insertCharge(group, memberA, { dueAt: OVERDUE });

    await runner.runAll('manual', { job: 'billing.overdue' });
    await runner.runAll('manual', { job: 'billing.overdue' });

    const member = await notices(memberA);
    expect(member.filter((n) => n.type === 'retiro_por_mora')).toHaveLength(1);
    const owner = await notices(group.ownerId);
    expect(owner.filter((n) => n.type === 'retiro_por_mora_titular')).toHaveLength(1);
  });

  it('CA-002-28: un miembro al día no recibe aviso de retiro', async () => {
    await runner.runAll('manual', { job: 'billing.overdue' });
    const other = group.memberIds[1] as string;
    expect((await notices(other)).filter((n) => n.type.startsWith('retiro'))).toHaveLength(0);
  });
});
