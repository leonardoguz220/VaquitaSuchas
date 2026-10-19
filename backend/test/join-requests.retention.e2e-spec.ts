import { DbService } from '../src/shared/db/db.service.js';
import { JobRegistry } from '../src/shared/jobs/job-registry.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';
import { pngBytes } from './support/receipt-files.js';

const monthsAgo = (months: number): string => {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString();
};

// Retención de 2 meses del chat, imágenes y comprobantes (spec 010 US7, T041/T042).
describe('Retención de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;

  const run = (): Promise<number> =>
    (
      harness.app.get(JobRegistry, { strict: false }).get('join-requests.retention') as {
        run(ctx: unknown): Promise<number>;
      }
    ).run({
      now: harness.clock.now(),
      trigger: 'manual',
      db: harness.app.get(DbService, { strict: false }),
    });
  const row = async (id: string): Promise<Record<string, unknown>> =>
    (await harness.pool.query('SELECT * FROM join_requests WHERE id = $1', [id])).rows[0];
  const messageCount = async (id: string): Promise<number> =>
    Number(
      (
        await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM join_messages WHERE request_id = $1',
          [id],
        )
      ).rows[0]?.n,
    );

  /** Solicitud en estado final hace `months` meses, con un mensaje de texto, otro con imagen y comprobante. */
  const finalRequest = async (months: number): Promise<{ id: string; keys: string[] }> => {
    const applicant = await harness.insertUser();
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    const imageKey = `join-requests/${id}/chat.png`;
    const proofKey = `join-requests/${id}/proof.png`;
    await harness.storage.put(imageKey, pngBytes(), { contentType: 'image/png' });
    await harness.storage.put(proofKey, pngBytes(), { contentType: 'image/png' });
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, 'hola')`,
      [id, applicant],
    );
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, image_key, image_mime, image_size_bytes)
       VALUES ($1, $2, $3, 'image/png', 4)`,
      [id, applicant, imageKey],
    );
    await harness.pool.query(`UPDATE join_requests SET proof_key = $2 WHERE id = $1`, [
      id,
      proofKey,
    ]);
    await harness.pool.query(
      `UPDATE join_requests SET status = 'rechazada', final_at = $2, final_reason = 'rechazo_titular',
              reject_reason = 'Sin cupo para ti', version = version + 1 WHERE id = $1`,
      [id, monthsAgo(months)],
    );
    return { id, keys: [imageKey, proofKey] };
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
  });
  afterEach(() => setClock(harness, NOW));

  it('CA-010-44: a los 2 meses se borran chat, imágenes y comprobante y se conserva la línea de tiempo', async () => {
    const { id, keys } = await finalRequest(3);

    await run();

    expect(await messageCount(id)).toBe(0);
    for (const key of keys) expect(await harness.storage.exists(key)).toBe(false);
    const stored = await row(id);
    expect(stored['content_purged_at']).not.toBeNull();
    expect(stored['status']).toBe('rechazada');
    const events = await harness.pool.query(
      'SELECT 1 FROM join_request_events WHERE request_id = $1',
      [id],
    );
    expect(events.rowCount).toBeGreaterThan(0);
  });

  it('CA-010-44: antes de los 2 meses no se borra nada y es idempotente', async () => {
    const recent = await finalRequest(1);
    const old = await finalRequest(3);

    expect(await run()).toBe(1);
    expect(await run()).toBe(0);

    expect(await messageCount(recent.id)).toBe(2);
    expect(await harness.storage.exists(recent.keys[0] as string)).toBe(true);
    expect((await row(recent.id))['content_purged_at']).toBeNull();
    expect(await messageCount(old.id)).toBe(0);
  });

  it('CA-010-44: con un reclamo abierto no se elimina nada', async () => {
    const { id, keys } = await finalRequest(3);
    const request = await row(id);
    await harness.pool.query(
      `INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at)
       VALUES ($1, 'pago_sin_ingreso', $2, $3, 'No me dejaron entrar al grupo', $4)`,
      [id, request['applicant_id'], group.ownerId, monthsAgo(3)],
    );

    await run();

    expect(await messageCount(id)).toBe(2);
    expect(await harness.storage.exists(keys[0] as string)).toBe(true);
    expect((await row(id))['content_purged_at']).toBeNull();
  });

  it('CA-010-44: la evidencia de un reclamo resuelto se borra 2 meses después de resolverse', async () => {
    const { id } = await finalRequest(4);
    const request = await row(id);
    const evidenceKey = `join-requests/${id}/evidence.png`;
    await harness.storage.put(evidenceKey, pngBytes(), { contentType: 'image/png' });
    await harness.pool.query(
      `INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at,
                                  evidence_key, evidence_mime, status, resolution, resolution_reason,
                                  resolved_by, resolved_at)
       VALUES ($1, 'pago_sin_ingreso', $2, $3, 'No me dejaron entrar al grupo', $4, $5, 'image/png',
               'resuelto', 'sin_falta', 'Sin pruebas suficientes', $3, $6)`,
      [id, request['applicant_id'], group.ownerId, monthsAgo(4), evidenceKey, monthsAgo(3)],
    );

    await run();

    expect(await harness.storage.exists(evidenceKey)).toBe(false);
    const dispute = await harness.pool.query(
      'SELECT evidence_key, evidence_purged_at FROM join_disputes WHERE request_id = $1',
      [id],
    );
    expect(dispute.rows[0].evidence_key).toBe(evidenceKey);
    expect(dispute.rows[0].evidence_purged_at).not.toBeNull();
    expect((await row(id))['content_purged_at']).not.toBeNull();
  });
});
