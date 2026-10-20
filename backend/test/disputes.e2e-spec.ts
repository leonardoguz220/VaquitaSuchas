import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedFinalRequest } from './support/disputes-fixtures.js';
import { setClock } from './support/join-requests-fixtures.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { exeBytes, jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

const DESCRIPTION = 'Pagué por QR y el titular nunca me dejó entrar';
const DAY = 24 * 3600_000;
const daysAgo = (days: number): string => new Date(Date.parse(NOW) - days * DAY).toISOString();

// Reclamos de solicitudes de ingreso (spec 010 US6, T037/T038) contra PostgreSQL real.
describe('Reclamos de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const open = (
    userId: string,
    requestId: string,
    fields: { description?: string; evidence?: { bytes: Buffer; filename: string } } = {},
  ): request.Test => {
    let call = auth(http().post(`/join-requests/${requestId}/disputes`), userId).field(
      'description',
      fields.description ?? DESCRIPTION,
    );
    if (fields.evidence)
      call = call.attach('evidence', fields.evidence.bytes, { filename: fields.evidence.filename });
    return call;
  };
  const respond = (
    userId: string,
    requestId: string,
    disputeId: string,
    text = 'Sí recibí tu pago, pero me confundí de cuenta',
  ): request.Test =>
    auth(http().post(`/join-requests/${requestId}/disputes/${disputeId}/response`), userId).field(
      'text',
      text,
    );
  const disputeCount = async (): Promise<number> =>
    Number(
      (await harness.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM join_disputes'))
        .rows[0]?.n,
    );

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    harness.storage.files.clear();
    harness.storage.failPut = false;
    harness.storage.failSignedUrl = false;
    await harness.pool.query('DELETE FROM join_disputes');
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('CA-010-27: el solicitante abre un reclamo por pago sin ingreso (expirada sin respuesta) y el titular responde una vez', async () => {
    const id = await seedFinalRequest(
      harness,
      group,
      applicant,
      'expirada_sin_respuesta',
      daysAgo(2),
    );
    const created = await open(applicant, id, {
      evidence: { bytes: pngBytes(2048), filename: 'captura-privada.png' },
    }).expect(201);
    expect(created.body).toMatchObject({
      kind: 'pago_sin_ingreso',
      status: 'abierto',
      openedBy: { userId: applicant },
      description: DESCRIPTION,
      evidenceAvailable: true,
      response: null,
      resolution: null,
    });
    const row = await harness.pool.query<{ accused_id: string; evidence_key: string }>(
      'SELECT accused_id, evidence_key FROM join_disputes WHERE id = $1',
      [created.body.id],
    );
    expect(row.rows[0]?.accused_id).toBe(group.ownerId);
    expect(row.rows[0]?.evidence_key).toMatch(/^join-requests\/.+\/dispute-[0-9a-f-]+\.png$/);
    expect(row.rows[0]?.evidence_key).not.toContain('captura-privada');

    // Solo la otra parte responde; el reclamo no cambia el estado de la solicitud (RN-010-07).
    await respond(applicant, id, created.body.id).expect(403);
    const answered = await respond(group.ownerId, id, created.body.id).expect(200);
    expect(answered.body.response).toMatchObject({ evidenceAvailable: false });
    const state = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_requests WHERE id = $1',
      [id],
    );
    expect(state.rows[0]?.status).toBe('expirada');
  });

  it('CA-010-27: también procede tras un rechazo del titular con pago informado', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada', daysAgo(6));
    await open(applicant, id).expect(201);
  });

  it('CA-010-27: el titular abre comprobante_falso si rechazó marcando el comprobante como falso', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada_falso');
    const created = await open(group.ownerId, id).expect(201);
    expect(created.body.kind).toBe('comprobante_falso');
    const row = await harness.pool.query<{ accused_id: string }>(
      'SELECT accused_id FROM join_disputes WHERE id = $1',
      [created.body.id],
    );
    expect(row.rows[0]?.accused_id).toBe(applicant);
  });

  it('CA-010-27: una sola respuesta (DISPUTE_ALREADY_RESPONDED) y no responde si ya se resolvió', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const created = await open(applicant, id).expect(201);
    await respond(group.ownerId, id, created.body.id).expect(200);
    const second = await respond(group.ownerId, id, created.body.id).expect(422);
    expect(second.body.code).toBe('DISPUTE_ALREADY_RESPONDED');
    const other = await seedFinalRequest(harness, group, await harness.insertUser(), 'rechazada');
    const unknown = await respond(group.ownerId, other, created.body.id).expect(404);
    expect(unknown.body.code).toBe('NOT_FOUND');

    const resolvedId = await seedFinalRequest(
      harness,
      group,
      await harness.insertUser(),
      'rechazada',
    );
    const resolved = await open(
      (
        await harness.pool.query<{ applicant_id: string }>(
          'SELECT applicant_id FROM join_requests WHERE id = $1',
          [resolvedId],
        )
      ).rows[0]?.applicant_id as string,
      resolvedId,
    ).expect(201);
    await harness.pool.query(
      `UPDATE join_disputes SET status = 'resuelto', resolution = 'sin_falta',
              resolution_reason = 'Sin falta comprobada', resolved_by = $2, resolved_at = now()
        WHERE id = $1`,
      [resolved.body.id, group.ownerId],
    );
    const late = await respond(group.ownerId, resolvedId, resolved.body.id).expect(422);
    expect(late.body.code).toBe('DISPUTE_RESOLVED');
  });

  it('CA-010-28: sin pago informado, o por quien no corresponde, se rechaza (DISPUTE_NOT_ALLOWED)', async () => {
    const noPayment = await seedFinalRequest(harness, group, applicant, 'sin_pago');
    const denied = await open(applicant, noPayment).expect(422);
    expect(denied.body.code).toBe('DISPUTE_NOT_ALLOWED');
    // El titular no reclama pago sin ingreso ni sin marcar el comprobante como falso.
    const plain = await seedFinalRequest(harness, group, await harness.insertUser(), 'rechazada');
    await open(group.ownerId, plain).expect(422);
    expect(await disputeCount()).toBe(0);
  });

  it('CA-010-28: un segundo reclamo de la misma parte se rechaza (DISPUTE_ALREADY_OPEN)', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    await open(applicant, id).expect(201);
    const again = await open(applicant, id).expect(422);
    expect(again.body.code).toBe('DISPUTE_ALREADY_OPEN');
    expect(await disputeCount()).toBe(1);
  });

  it('CA-010-28: pasados 7 días desde el cierre se rechaza (DISPUTE_WINDOW_CLOSED); al borde de 7 días aún procede', async () => {
    const late = await seedFinalRequest(harness, group, applicant, 'rechazada', daysAgo(7.5));
    const closed = await open(applicant, late).expect(422);
    expect(closed.body.code).toBe('DISPUTE_WINDOW_CLOSED');
    const edge = await seedFinalRequest(
      harness,
      group,
      await harness.insertUser(),
      'rechazada',
      daysAgo(7),
    );
    const edgeApplicant = (
      await harness.pool.query<{ applicant_id: string }>(
        'SELECT applicant_id FROM join_requests WHERE id = $1',
        [edge],
      )
    ).rows[0]?.applicant_id as string;
    await open(edgeApplicant, edge).expect(201);
  });

  it('CA-010-28: el plazo lo decide el reloj del servidor, no un campo del cliente', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada', daysAgo(6));
    setClock(harness, new Date(Date.parse(NOW) + 2 * DAY).toISOString());
    // Un campo de fecha del cliente se rechaza (400) y, sin él, manda el reloj del servidor.
    await auth(http().post(`/join-requests/${id}/disputes`), applicant)
      .field('description', DESCRIPTION)
      .field('openedAt', NOW)
      .expect(400);
    const response = await open(applicant, id);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('DISPUTE_WINDOW_CLOSED');
  });

  it('CA-010-28: una solicitud aún activa (sin estado final) no admite reclamo', async () => {
    const pending = await harness.pool.query<{ id: string }>(
      `INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
       VALUES ($1, $2, $3, $3) RETURNING id`,
      [group.id, applicant, NOW],
    );
    const denied = await open(applicant, pending.rows[0]?.id as string).expect(422);
    expect(denied.body.code).toBe('DISPUTE_NOT_ALLOWED');
  });

  it('CA-010-46: una imagen de más de 5 MB se rechaza (413) y no queda reclamo ni archivo', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const response = await open(applicant, id, {
      evidence: { bytes: jpegBytes(5 * 1024 * 1024 + 1), filename: 'grande.jpg' },
    });
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('FILE_TOO_LARGE');
    expect(await disputeCount()).toBe(0);
    expect(harness.storage.files.size).toBe(0);
  });

  it.each([
    ['PDF', pdfBytes, 'evidencia.pdf'],
    ['ejecutable disfrazado de JPG', exeBytes, 'evidencia.jpg'],
  ])('CA-010-46: %s se rechaza por firma binaria (415)', async (_name, make, filename) => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const response = await open(applicant, id, { evidence: { bytes: make(1024), filename } });
    expect(response.status).toBe(415);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await disputeCount()).toBe(0);
    expect(harness.storage.files.size).toBe(0);
  });

  it('CA-010-46: una imagen de exactamente 5 MB se acepta', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    await open(applicant, id, {
      evidence: { bytes: jpegBytes(5 * 1024 * 1024), filename: 'justa.jpg' },
    }).expect(201);
  });

  it('RF-010-21: la descripción de menos de 10 o más de 500 caracteres es un 400', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    await open(applicant, id, { description: 'corto' }).expect(400);
    await open(applicant, id, { description: 'x'.repeat(501) }).expect(400);
    await auth(http().post(`/join-requests/${id}/disputes`), applicant).expect(400);
    expect(await disputeCount()).toBe(0);
  });

  it('RNF-010-08: un fallo del almacén no deja reclamo y el error no filtra el archivo', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    harness.storage.failPut = true;
    const response = await open(applicant, id, {
      evidence: { bytes: pngBytes(), filename: 'secreto.png' },
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('secreto');
    expect(await disputeCount()).toBe(0);
  });

  it('RF-010-22: ambas partes listan los reclamos; un miembro ajeno a la solicitud recibe 403 y un extraño 404', async () => {
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    const created = await open(applicant, id).expect(201);
    for (const viewer of [applicant, group.ownerId]) {
      const listed = await auth(http().get(`/join-requests/${id}/disputes`), viewer).expect(200);
      expect(listed.body.items.map((d: { id: string }) => d.id)).toEqual([created.body.id]);
    }
    const member = group.memberIds[0] as string;
    await auth(http().get(`/join-requests/${id}/disputes`), member).expect(403);
    await open(member, id).expect(403);
    const stranger = await harness.insertUser();
    await auth(http().get(`/join-requests/${id}/disputes`), stranger).expect(404);
    await open(stranger, id).expect(404);
    await http().get(`/join-requests/${id}/disputes`).expect(401);
  });

  it('RNF-010-02: los logs no llevan descripción, nombre de archivo ni claves del almacén', async () => {
    const lines: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    const id = await seedFinalRequest(harness, group, applicant, 'rechazada');
    harness.storage.failPut = true;
    await open(applicant, id, {
      description: 'Descripción muy privada del reclamo',
      evidence: { bytes: pngBytes(), filename: 'nombre-privado.png' },
    });
    harness.storage.failPut = false;
    await open(applicant, id, { description: 'Descripción muy privada del reclamo' }).expect(201);
    const text = lines.join('\n');
    expect(text).not.toContain('privad');
    expect(text).not.toMatch(/dispute-[0-9a-f-]{36}/);
  });
});
