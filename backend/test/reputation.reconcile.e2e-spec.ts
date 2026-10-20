import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness } from './support/billing-harness.js';
import { ReputationFixtures } from './support/reputation-fixtures.js';
import { ReputationModule } from '../src/modules/reputation/reputation.module.js';

// Conciliación diaria de la calificación (spec 007, T013, CA-007-14).
describe('Reputación: conciliación diaria', () => {
  const harness = new BillingHarness({ imports: [ReputationModule] });
  const fixtures = new ReputationFixtures(harness);
  let runner: JobRunner;

  const reconcile = () =>
    runner.runAll('manual', { job: 'reputation.reconcile', ignoreInterval: true });

  const stored = async (userId: string) =>
    (
      await harness.pool.query<{
        considered_count: number;
        punctual_count: number;
        rules_version: number;
        level: string;
      }>(
        'SELECT considered_count, punctual_count, rules_version, level FROM user_reputation WHERE user_id = $1',
        [userId],
      )
    ).rows[0];

  beforeAll(async () => {
    await harness.start();
    runner = harness.app.get(JobRunner, { strict: false });
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  it('CA-007-14: el recálculo coincide con lo guardado; si difiere, lo corrige y reporta el drift', async () => {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    for (const period of ['2026-06', '2026-07', '2026-08'])
      await fixtures.fact(group, user, { period });
    // Calificación guardada mal (p. ej. un evento perdido): 5 considerados y todos tardíos.
    await harness.pool.query(
      `INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                                    displayed_half_stars, level, current_streak, rules_version, computed_at)
       VALUES ($1, 5, 0, 5, 0, 'En riesgo', 0, 1, now())`,
      [user],
    );

    const first = await reconcile();
    expect(first).toEqual([expect.objectContaining({ job: 'reputation.reconcile', status: 'ok' })]);
    expect(await stored(user)).toMatchObject({
      considered_count: 3,
      punctual_count: 3,
      level: 'Excelente',
    });
    const warning = await harness.pool.query<{ error_message: string | null }>(
      `SELECT error_message FROM job_runs WHERE job_name = 'reputation.reconcile' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(warning.rows[0]?.error_message).toMatch(/drift: [1-9]/);

    harness.clock.advance(1000);
    await reconcile();
    const clean = await harness.pool.query<{ error_message: string | null }>(
      `SELECT error_message FROM job_runs WHERE job_name = 'reputation.reconcile' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(clean.rows[0]?.error_message ?? '').not.toContain('drift');
  });

  it('crea la fila de quien tiene cobros y aún no tenía calificación guardada', async () => {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    await fixtures.fact(group, user, { period: '2026-08' });

    await reconcile();

    expect(await stored(user)).toMatchObject({
      considered_count: 1,
      punctual_count: 1,
      level: 'Nuevo',
    });
  });

  it('RN-007-07: si cambió RULES_VERSION recalcula a todos', async () => {
    const owner = await harness.insertUser();
    const user = await harness.insertUser();
    const group = await fixtures.reports.createGroup({ ownerId: owner, memberIds: [user] });
    await fixtures.fact(group, user, { period: '2026-08' });
    await reconcile();
    await harness.pool.query('UPDATE user_reputation SET rules_version = 0 WHERE user_id = $1', [
      user,
    ]);

    await reconcile();

    expect((await stored(user))?.rules_version).toBe(1);
  });
});
