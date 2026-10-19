import request from 'supertest';
import { DbService } from '../src/shared/db/db.service.js';
import type {
  DecisionReminderDue,
  JoinRequestExpired,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';
import { jpegBytes } from './support/receipt-files.js';

const minutes = (base: string, delta: number): string =>
  new Date(Date.parse(base) + delta * 60_000).toISOString();

// Plazos y ventana de ingreso de las solicitudes (spec 010 US7, T041/T042) contra PostgreSQL real.
describe('Plazos de las solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const reminders: DecisionReminderDue[] = [];
  const expired: JoinRequestExpired[] = [];
  let group: TestGroup;
  let applicant: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const detail = async (userId: string, id: string): Promise<request.Response> =>
    auth(http().get(`/join-requests/${id}`), userId).expect(200);
  const sweep = (): Promise<number> =>
    (
      harness.app.get(JobRegistry, { strict: false }).get('join-requests.sweep') as {
        run(ctx: unknown): Promise<number>;
      }
    ).run({
      now: harness.clock.now(),
      trigger: 'manual',
      db: harness.app.get(DbService, { strict: false }),
    });
  const row = async (id: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM join_requests WHERE id = $1', [id])).rows[0];
  const timeline = async (id: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at',
        [id],
      )
    ).rows.map((r) => r.type);

  beforeAll(async () => {
    await harness.start();
    const bus = harness.app.get(TxEventBus, { strict: false });
    bus.register<DecisionReminderDue>('join-requests.decision-reminder-due', (_tx, e) => {
      reminders.push(e);
    });
    bus.register<JoinRequestExpired>('join-requests.expired', (_tx, e) => {
      expired.push(e);
    });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    reminders.length = 0;
    expired.length = 0;
  });
  afterEach(() => setClock(harness, NOW));

  it('CA-010-09: esperando_pago sin comprobante vence a los 15 min aunque la tarea no corrió', async () => {
    const id = await seedRequest(harness, group, applicant, 'esperando_pago');
    await harness.pool.query('UPDATE join_requests SET pay_deadline_at = $2 WHERE id = $1', [
      id,
      minutes(NOW, 15),
    ]);
    setClock(harness, minutes(NOW, 16));

    const view = await detail(applicant, id);

    expect(view.body.phase.status).toBe('expirada');
    expect((await row(id))['status']).toBe('esperando_pago');
    expect(await sweep()).toBeGreaterThanOrEqual(1);
    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'plazo_pago' });
    expect(await timeline(id)).toContain('expirada');
    expect(expired.map((e) => e.requestId)).toEqual([id]);
  });

  it('CA-010-14: a los 30 min sin decisión el titular recibe un recordatorio, una sola vez', async () => {
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    await harness.pool.query('UPDATE join_requests SET decision_deadline_at = $2 WHERE id = $1', [
      id,
      minutes(NOW, 60),
    ]);

    setClock(harness, minutes(NOW, 29));
    await sweep();
    expect(reminders).toHaveLength(0);

    setClock(harness, minutes(NOW, 30));
    await sweep();
    await sweep();

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ requestId: id, hostId: group.ownerId });
    expect((await row(id))['reminder_sent_at']).not.toBeNull();
    expect((await row(id))['status']).toBe('pago_informado');
    expect((await timeline(id)).filter((t) => t === 'recordatorio_enviado')).toHaveLength(1);
  });

  it('CA-010-15: a los 60 min sin decisión pasa a expirada por titular_sin_respuesta', async () => {
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    await harness.pool.query('UPDATE join_requests SET decision_deadline_at = $2 WHERE id = $1', [
      id,
      minutes(NOW, 60),
    ]);
    setClock(harness, minutes(NOW, 61));

    await sweep();

    expect(await row(id)).toMatchObject({
      status: 'expirada',
      final_reason: 'titular_sin_respuesta',
    });
    expect(expired[0]).toMatchObject({ requestId: id, reason: 'titular_sin_respuesta' });
    expect(reminders).toHaveLength(0);
  });

  it('CA-010-39: una solicitud abierta cuando termina la ventana se evalúa como expirada', async () => {
    const openedAt = '2026-10-18T20:00:00.000Z';
    const id = await seedRequest(harness, group, applicant, 'abierta', {
      openedAt,
      openMinutes: 480,
    });
    setClock(harness, '2026-10-19T04:30:00.000Z');

    const view = await detail(applicant, id);
    await sweep();

    expect(view.body.phase.status).toBe('expirada');
    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'ventana_cerrada' });
  });

  it('CA-010-38 y RN-010-12: lo iniciado el día 3 se completa; las demás abiertas no reciben datos de pago', async () => {
    const openedAt = '2026-10-19T03:50:00.000Z';
    const inProgress = await seedRequest(harness, group, applicant, 'esperando_pago', { openedAt });
    await harness.pool.query('UPDATE join_requests SET pay_deadline_at = $2 WHERE id = $1', [
      inProgress,
      '2026-10-19T04:50:00.000Z',
    ]);
    const other = await harness.insertUser();
    const stillOpen = await seedRequest(harness, group, other, 'abierta', {
      openedAt,
      openMinutes: 60 * 24,
    });
    setClock(harness, '2026-10-19T04:05:00.000Z');

    const proof = await auth(http().post(`/join-requests/${inProgress}/proof`), applicant)
      .field('method', 'qr')
      .field('reference', 'REF-0002')
      .attach('file', jpegBytes(), { filename: 'c.jpg' });
    const payment = await auth(
      http().post(`/join-requests/${stillOpen}/payment-data`),
      group.ownerId,
    );

    expect(proof.status).toBe(200);
    expect(payment.status).toBe(422);
    expect(payment.body.code).toBe('ENTRY_WINDOW_CLOSED');
  });
});
