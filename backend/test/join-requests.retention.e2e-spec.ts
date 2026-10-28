import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { StorageError } from '../src/shared/ports/file-storage.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

// Retención de 2 meses del contenido de las solicitudes (spec 010 US7, T041/T042, RNF-010-09).
describe('Retención del contenido de las solicitudes de ingreso (join_requests.retention)', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;

  const monthsAgo = (months: number, extraDays = 0): string => {
    const date = new Date(NOW);
    date.setUTCMonth(date.getUTCMonth() - months);
    date.setUTCDate(date.getUTCDate() - extraDays);
    return date.toISOString();
  };
  const run = async (): Promise<number> => {
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.retention', ignoreInterval: true });
    expect(result).toMatchObject({ job: 'join_requests.retention', status: 'ok' });
    return (result as { processed: number }).processed;
  };
  const put = (key: string): string => {
    harness.storage.files.set(key, { body: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
    return key;
  };

  interface Files {
    id: string;
    proof: string;
    qr: string;
    chatImage: string;
    evidence: string;
  }

  /**
   * Solicitud rechazada en `finalAt` con comprobante, QR, un mensaje con imagen, uno de texto y un
   * reclamo con evidencia. `dispute` fija el estado del reclamo.
   */
  const finished = async (
    finalAt: string,
    dispute: 'none' | 'abierto' | { resolvedAt: string } = 'none',
  ): Promise<Files> => {
    const user = await harness.insertUser();
    const id = await seedRequest(harness, group, user, 'pago_informado', {
      openedAt: monthsAgo(4),
    });
    const tag = id.slice(0, 8);
    const files: Files = {
      id,
      proof: put(`join-requests/${tag}/proof.png`),
      qr: put(`join-requests/${tag}/qr.png`),
      chatImage: put(`join-requests/${tag}/chat.png`),
      evidence: dispute === 'none' ? '' : put(`join-requests/${tag}/evidence.png`),
    };
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, 'hola, ya pagué')`,
      [id, user],
    );
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, image_key, image_mime, image_size_bytes)
       VALUES ($1, $2, $3, 'image/png', 3)`,
      [id, group.ownerId, files.chatImage],
    );
    if (dispute !== 'none') {
      const resolved = dispute !== 'abierto';
      await harness.pool.query(
        `INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description,
                                    evidence_key, evidence_mime, opened_at, status, resolution,
                                    resolution_reason, resolved_by, resolved_at)
         VALUES ($1, 'pago_sin_ingreso', $2, $3, 'Pagué y no me dejaron entrar', $4, 'image/png',
                 $5, $6, $7, $8, $9, $10)`,
        [
          id,
          user,
          group.ownerId,
          files.evidence,
          monthsAgo(4),
          resolved ? 'resuelto' : 'abierto',
          resolved ? 'sin_falta' : null,
          resolved ? 'Se revisó el caso con las pruebas' : null,
          resolved ? await harness.insertUser() : null,
          resolved ? (dispute as { resolvedAt: string }).resolvedAt : null,
        ],
      );
    }
    await harness.pool.query(
      `UPDATE join_requests SET payment_qr_key = $2, payment_qr_mime = 'image/png', proof_key = $3,
              status = 'rechazada', final_at = $4, final_reason = 'rechazo_titular',
              reject_reason = 'No recibí el pago',
              decided_by = (SELECT owner_id FROM groups WHERE id = join_requests.group_id)
        WHERE id = $1`,
      [id, files.qr, files.proof, finalAt],
    );
    return files;
  };
  const has = (key: string): boolean => harness.storage.files.has(key);
  const state = async (id: string) => {
    const r = await harness.pool.query<{
      purged: Date | null;
      messages: string;
      events: string;
      status: string;
      proof_key: string | null;
      reject_reason: string | null;
    }>(
      `SELECT content_purged_at AS purged, status, proof_key, reject_reason,
              (SELECT count(*)::text FROM join_messages WHERE request_id = $1) AS messages,
              (SELECT count(*)::text FROM join_request_events WHERE request_id = $1) AS events
         FROM join_requests WHERE id = $1`,
      [id],
    );
    return r.rows[0] as (typeof r.rows)[number];
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-44: a los 2 meses del estado final se eliminan chat, imágenes y comprobante y se conserva la línea de tiempo', async () => {
    const files = await finished(monthsAgo(2, 1));

    expect(await run()).toBe(1);

    for (const key of [files.proof, files.qr, files.chatImage]) {
      expect(has(key) ? key : null).toBeNull();
    }
    expect(await state(files.id)).toMatchObject({
      messages: '0',
      status: 'rechazada',
      reject_reason: 'No recibí el pago',
    });
    expect((await state(files.id)).purged).toBeInstanceOf(Date);
    expect(Number((await state(files.id)).events)).toBeGreaterThanOrEqual(1);
    // El titular y el solicitante siguen viendo la línea de tiempo y la decisión.
    const detail = await request(harness.app.getHttpServer())
      .get(`/join-requests/${files.id}`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      phase: { status: 'rechazada' },
      rejectReason: 'No recibí el pago',
    });
    expect(detail.body.timeline.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-010-44: antes de los 2 meses no se elimina nada', async () => {
    const files = await finished(monthsAgo(1, 20));

    expect(await run()).toBe(0);

    expect(has(files.proof) && has(files.chatImage) && has(files.qr)).toBe(true);
    expect(await state(files.id)).toMatchObject({ purged: null, messages: '2' });
  });

  it('CA-010-44: las solicitudes activas no se tocan aunque sean antiguas', async () => {
    const id = await seedRequest(harness, group, applicant, 'abierta', { openedAt: monthsAgo(5) });
    await harness.pool.query(
      `INSERT INTO join_messages (request_id, sender_id, body) VALUES ($1, $2, 'hola')`,
      [id, applicant],
    );

    expect(await run()).toBe(0);

    expect(await state(id)).toMatchObject({ purged: null, messages: '1' });
  });

  it('CA-010-44: con un reclamo abierto no se elimina nada', async () => {
    const files = await finished(monthsAgo(3), 'abierto');

    expect(await run()).toBe(0);

    expect(has(files.proof) && has(files.evidence) && has(files.chatImage)).toBe(true);
    expect(await state(files.id)).toMatchObject({ purged: null, messages: '2' });
  });

  it('CA-010-44: con un reclamo resuelto se cuentan 2 meses desde su resolución', async () => {
    const recent = await finished(monthsAgo(4), { resolvedAt: monthsAgo(1) });
    const old = await finished(monthsAgo(4), { resolvedAt: monthsAgo(2, 1) });

    expect(await run()).toBe(1);

    expect((await state(recent.id)).purged).toBeNull();
    expect(has(recent.evidence)).toBe(true);
    expect((await state(old.id)).purged).toBeInstanceOf(Date);
    expect(has(old.evidence)).toBe(false);
    const dispute = await harness.pool.query<{ evidence_purged_at: Date | null; status: string }>(
      'SELECT evidence_purged_at, status FROM join_disputes WHERE request_id = $1',
      [old.id],
    );
    expect(dispute.rows[0]?.evidence_purged_at).toBeInstanceOf(Date);
    expect(dispute.rows[0]?.status).toBe('resuelto');
  });

  it('CA-010-44: si falla el borrado de un archivo no se marca nada y el día siguiente se reintenta', async () => {
    const files = await finished(monthsAgo(3));
    const real = harness.storage.delete.bind(harness.storage);
    const spy = jest
      .spyOn(harness.storage, 'delete')
      .mockImplementationOnce(() => Promise.reject(new StorageError('falla simulada')));

    const [failed] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'join_requests.retention', ignoreInterval: true });

    expect(failed).toEqual({ job: 'join_requests.retention', status: 'error', error: 'Error' });
    expect(await state(files.id)).toMatchObject({ purged: null, messages: '2' });

    spy.mockImplementation((key: string) => real(key));
    expect(await run()).toBe(1);
    expect((await state(files.id)).purged).toBeInstanceOf(Date);
    expect(has(files.proof)).toBe(false);
  });

  it('CA-010-44: es idempotente; una segunda pasada no procesa nada', async () => {
    await finished(monthsAgo(3));
    expect(await run()).toBe(1);
    harness.storage.deleted.length = 0;

    expect(await run()).toBe(0);
    expect(harness.storage.deleted).toEqual([]);
  });

  it('CA-010-44 y CA-010-23: la limpieza declara allow_purge solo en su transacción; fuera de ella borrar un mensaje sigue prohibido', async () => {
    const files = await finished(monthsAgo(3));
    await expect(
      harness.pool.query('DELETE FROM join_messages WHERE request_id = $1', [files.id]),
    ).rejects.toMatchObject({ code: '23001' });

    await run();

    await expect(
      harness.pool.query("SELECT current_setting('vaquita.allow_purge', true) AS v"),
    ).resolves.toMatchObject({ rows: [{ v: expect.not.stringMatching(/^on$/) }] });
  });

  it('RNF-010-09: el chat de una solicitud purgada aparece vacío y sin archivos para sus participantes', async () => {
    const files = await finished(monthsAgo(3));
    await run();

    const chat = await request(harness.app.getHttpServer())
      .get(`/join-requests/${files.id}/messages`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .expect(200);

    expect(chat.body.items).toEqual([]);
  });
});
