import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type {
  DecisionReminderDue,
  JoinRequestExpired,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { inviteCodeOf, seedRequest, setClock } from './support/join-requests-fixtures.js';
import { jpegBytes } from './support/receipt-files.js';

// Plazos y barrido de vencimientos (spec 010 US7, T041/T042) contra PostgreSQL real.
describe('Plazos de las solicitudes de ingreso y tarea join_requests.sweep', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const expired: JoinRequestExpired[] = [];
  const reminders: DecisionReminderDue[] = [];
  let group: TestGroup;
  let applicant: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test => auth(http().get(url), userId);
  const post = (userId: string, url: string): request.Test => auth(http().post(url), userId);
  const at = (minutes: number): string =>
    new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

  /** Ejecuta la tarea como lo hace el tick: con el reloj falso de la prueba. */
  const sweep = async (): Promise<number> => {
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.sweep' });
    expect(result).toMatchObject({ job: 'join_requests.sweep', status: 'ok' });
    return (result as { processed: number }).processed;
  };
  const row = async (id: string) =>
    (
      await harness.pool.query<{
        status: string;
        final_reason: string | null;
        final_at: Date | null;
        reminder_sent_at: Date | null;
      }>(
        'SELECT status, final_reason, final_at, reminder_sent_at FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0] as {
      status: string;
      final_reason: string | null;
      final_at: Date | null;
      reminder_sent_at: Date | null;
    };
  const eventTypes = async (id: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at, id',
        [id],
      )
    ).rows.map((r) => r.type);
  const reserved = async (): Promise<number> =>
    (await get(group.ownerId, `/groups/${group.id}/join-requests`).expect(200)).body.slots.reserved;

  /** `esperando_pago` que vence a los `payMinutes` de NOW. */
  const waiting = async (userId: string, payMinutes = 15): Promise<string> => {
    const id = await seedRequest(harness, group, userId, 'esperando_pago');
    await harness.pool.query('UPDATE join_requests SET pay_deadline_at = $2 WHERE id = $1', [
      id,
      at(payMinutes),
    ]);
    return id;
  };
  /** `pago_informado` con el comprobante subido en NOW y decisión a los 60 min. */
  const informed = async (userId: string): Promise<string> => {
    const id = await seedRequest(harness, group, userId, 'pago_informado');
    await harness.pool.query('UPDATE join_requests SET decision_deadline_at = $2 WHERE id = $1', [
      id,
      at(60),
    ]);
    return id;
  };

  beforeAll(async () => {
    await harness.start();
    const bus = harness.app.get(TxEventBus, { strict: false });
    bus.register<JoinRequestExpired>('join-requests.expired', (_tx, event) => {
      expired.push(event);
    });
    bus.register<DecisionReminderDue>('join-requests.decision-reminder-due', (_tx, event) => {
      reminders.push(event);
    });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    // La tarea barre todos los grupos: se vacía lo que dejaron las pruebas anteriores.
    setClock(harness, '2030-01-01T00:00:00.000Z');
    await sweep();
    setClock(harness, NOW);
    expired.length = 0;
    reminders.length = 0;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-09: esperando_pago vence a los 15 min sin tarea: se ve expirada y el cupo queda libre', async () => {
    const id = await waiting(applicant);
    expect(await reserved()).toBe(1);

    setClock(harness, at(16));

    const seen = await get(applicant, `/join-requests/${id}`).expect(200);
    expect(seen.body.phase.status).toBe('expirada');
    expect(seen.body.finalReason).toBe('plazo_pago');
    expect(await reserved()).toBe(0);
    // R1: leer no escribe; la fila sigue como estaba hasta que alguien actúe o corra la tarea.
    expect((await row(id)).status).toBe('esperando_pago');
  });

  it('RNF-010-03 y CA-010-09: una acción sobre una solicitud vencida la persiste como expirada', async () => {
    const id = await waiting(applicant);
    setClock(harness, at(16));

    await post(applicant, `/join-requests/${id}/cancel`).expect(409);

    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'plazo_pago' });
    expect(await eventTypes(id)).toEqual(['abierta', 'expirada']);
  });

  it('RNF-010-03: abrir una solicitud nueva persiste el vencimiento de la anterior de la persona', async () => {
    const old = await seedRequest(harness, group, applicant, 'abierta', {
      openedAt: at(-25 * 60),
    });

    await post(applicant, '/join-requests')
      .send({ code: await inviteCodeOf(harness, group.id) })
      .expect(201);

    expect(await row(old)).toMatchObject({ status: 'expirada', final_reason: 'plazo_solicitud' });
  });

  it('CA-010-09 y RF-010-14: la tarea persiste el vencimiento, deja el evento del sistema y publica JoinRequestExpired', async () => {
    const id = await waiting(applicant);
    setClock(harness, at(16));

    expect(await sweep()).toBe(1);

    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'plazo_pago' });
    expect(await eventTypes(id)).toEqual(['abierta', 'expirada']);
    expect(expired).toEqual([
      expect.objectContaining({
        requestId: id,
        groupId: group.id,
        applicantId: applicant,
        hostId: group.ownerId,
        reason: 'plazo_pago',
      }),
    ]);
    // Idempotente: otra pasada no encuentra nada.
    expect(await sweep()).toBe(0);
    expect(expired).toHaveLength(1);
  });

  it('CA-010-14: a los 30 min sin decisión el titular recibe un recordatorio, una sola vez', async () => {
    const id = await informed(applicant);

    setClock(harness, at(29));
    expect(await sweep()).toBe(0);
    expect(reminders).toHaveLength(0);

    setClock(harness, at(30));
    expect(await sweep()).toBe(1);
    expect((await row(id)).reminder_sent_at?.toISOString()).toBe(at(30));
    expect(await eventTypes(id)).toEqual(['abierta', 'recordatorio_enviado']);
    expect(reminders).toEqual([
      expect.objectContaining({
        requestId: id,
        hostId: group.ownerId,
        applicantId: applicant,
        decisionDeadlineAt: new Date(at(60)),
      }),
    ]);

    setClock(harness, at(45));
    expect(await sweep()).toBe(0);
    expect(reminders).toHaveLength(1);
    expect((await row(id)).status).toBe('pago_informado');
  });

  it('CA-010-14: si la tarea corre tarde (ya pasaron los 60 min) no hay recordatorio, solo vence', async () => {
    const id = await informed(applicant);

    setClock(harness, at(75));
    await sweep();

    expect(reminders).toHaveLength(0);
    expect((await row(id)).status).toBe('expirada');
  });

  it('CA-010-15: a los 60 min sin decisión pasa a expirada por titular_sin_respuesta y el cupo se libera', async () => {
    const id = await informed(applicant);
    expect(await reserved()).toBe(1);

    setClock(harness, at(60));
    expect(await sweep()).toBe(1);

    expect(await row(id)).toMatchObject({
      status: 'expirada',
      final_reason: 'titular_sin_respuesta',
    });
    expect(expired).toEqual([
      expect.objectContaining({ requestId: id, reason: 'titular_sin_respuesta' }),
    ]);
    expect(await reserved()).toBe(0);
    const seen = await get(applicant, `/join-requests/${id}`).expect(200);
    expect(seen.body.timeline.at(-1)).toMatchObject({ type: 'expirada', actor: null });
  });

  it('RF-010-04: una solicitud abierta vence a las 24 h por plazo_solicitud', async () => {
    const id = await seedRequest(harness, group, applicant, 'abierta');

    setClock(harness, at(24 * 60 - 1));
    expect(await sweep()).toBe(0);
    setClock(harness, at(24 * 60));
    expect(await sweep()).toBe(1);

    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'plazo_solicitud' });
  });

  it('CA-010-39: una solicitud abierta cuando termina la ventana de ingreso pasa a expirada (ventana_cerrada)', async () => {
    // Abierta a las 10:00 UTC del 18 oct: su plazo lo limita el fin de la ventana (19 oct 04:00 UTC).
    const openedAt = '2026-10-18T10:00:00.000Z';
    const id = await seedRequest(harness, group, applicant, 'abierta', {
      openedAt,
      openMinutes: 18 * 60,
    });

    setClock(harness, '2026-10-19T03:59:00.000Z');
    expect(await sweep()).toBe(0);
    setClock(harness, '2026-10-19T04:01:00.000Z');
    const seen = await get(applicant, `/join-requests/${id}`).expect(200);
    expect(seen.body.phase.status).toBe('expirada');
    expect(await sweep()).toBe(1);

    expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'ventana_cerrada' });
  });

  it('CA-010-38 y RN-010-12: esperando_pago de las 23:50 sigue su curso tras la medianoche; la tarea no la toca y las abiertas ya no reciben datos de pago', async () => {
    const other = await harness.insertUser();
    const openedAt = '2026-10-18T10:00:00.000Z';
    const pending = await seedRequest(harness, group, applicant, 'abierta', {
      openedAt,
      openMinutes: 18 * 60,
    });
    const blocked = await seedRequest(harness, group, other, 'abierta', {
      openedAt,
      openMinutes: 18 * 60,
    });
    setClock(harness, '2026-10-19T03:50:00.000Z'); // 23:50 de La Paz
    await auth(post(group.ownerId, `/join-requests/${pending}/payment-data`), group.ownerId)
      .field('text', 'Transferir a la cuenta 123')
      .expect(200);

    setClock(harness, '2026-10-19T04:02:00.000Z'); // ya pasó la medianoche
    // La tarea vence la abierta sin enviar datos, pero deja viva la que ya está en pago.
    await sweep();
    expect((await row(pending)).status).toBe('esperando_pago');
    expect(await row(blocked)).toMatchObject({
      status: 'expirada',
      final_reason: 'ventana_cerrada',
    });

    await auth(http().post(`/join-requests/${pending}/proof`), applicant)
      .field('method', 'qr')
      .field('reference', 'REF-DEADLINE-1')
      .attach('file', jpegBytes(2048), { filename: 'c.jpg' })
      .expect(200);
    expect((await row(pending)).status).toBe('pago_informado');
  });

  it('RN-010-12: fuera de la ventana de ingreso no se abre una solicitud', async () => {
    setClock(harness, '2026-10-25T15:00:00.000Z');

    const response = await post(applicant, '/join-requests')
      .send({ code: await inviteCodeOf(harness, group.id) })
      .expect(422);

    expect(response.body.code).toBe('ENTRY_WINDOW_CLOSED');
  });

  it('RNF-010-03: una solicitud bloqueada por otra transacción se omite (SKIP LOCKED) y se procesa en la siguiente pasada', async () => {
    const id = await waiting(applicant);
    setClock(harness, at(16));
    const client = await harness.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM join_requests WHERE id = $1 FOR UPDATE', [id]);

      expect(await sweep()).toBe(0);
      expect((await row(id)).status).toBe('esperando_pago');
    } finally {
      await client.query('COMMIT');
      client.release();
    }

    expect(await sweep()).toBe(1);
    expect((await row(id)).status).toBe('expirada');
  });

  it('RNF-010-03: si una solicitud falla, las demás se procesan y la ejecución queda en error sin datos personales', async () => {
    const [first, second] = [await waiting(applicant), await waiting(await harness.insertUser())];
    setClock(harness, at(16));
    const bus = harness.app.get(TxEventBus, { strict: false });
    const original = bus.publish.bind(bus);
    let calls = 0;
    jest.spyOn(bus, 'publish').mockImplementation(async (tx, event) => {
      calls += 1;
      if (calls === 1) throw new Error('falla simulada ana@example.com');
      await original(tx, event);
    });

    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.sweep' });

    expect(result).toEqual({ job: 'join_requests.sweep', status: 'error', error: 'Error' });
    const statuses = [(await row(first)).status, (await row(second)).status].sort();
    expect(statuses).toEqual(['esperando_pago', 'expirada']);
  });
});
