import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type { ChargeSubmitted } from '../src/shared/events/charge-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { exeBytes, jpegBytes, pdfBytes, pngBytes, uploadReceipt } from './support/receipt-files.js';

// Subida del comprobante (spec 002, US2, T020) contra PostgreSQL real, con el almacén en memoria.
describe('Subida de comprobantes', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let titular: string;
  let payer: string; // dueño del cobro
  let other: string; // otro miembro
  let stranger: string;
  let chargeId: string;

  const receiptsOf = async (id: string): Promise<{ status: string; reference: string }[]> =>
    (
      await harness.pool.query<{ status: string; reference: string }>(
        'SELECT status, reference FROM receipts WHERE charge_id = $1 ORDER BY uploaded_at, id',
        [id],
      )
    ).rows;

  const chargeRow = async (
    id: string,
  ): Promise<{ status: string; first_submitted_at: Date | null; version: number }> =>
    (
      await harness.pool.query<{
        status: string;
        first_submitted_at: Date | null;
        version: number;
      }>('SELECT status, first_submitted_at, version FROM charges WHERE id = $1', [id])
    ).rows[0] as { status: string; first_submitted_at: Date | null; version: number };

  const activeReferences = async (): Promise<string[]> =>
    (
      await harness.pool.query<{ reference_key: string }>(
        `SELECT reference_key FROM payment_references
          WHERE group_id = $1 AND released_at IS NULL ORDER BY reference_key`,
        [group.id],
      )
    ).rows.map((row) => row.reference_key);

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    titular = group.ownerId;
    [payer, other] = group.memberIds as [string, string];
    stranger = await harness.insertUser();
    chargeId = await harness.insertCharge(group, payer);
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
    harness.storage.failPut = false;
    harness.storage.failSignedUrl = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-002-04: un JPG de 2 MB pasa el cobro a en_revision y queda en la línea de tiempo', async () => {
    const bus = harness.app.get(TxEventBus);
    const seen: ChargeSubmitted[] = [];
    const handler = (_tx: unknown, event: ChargeSubmitted): void => {
      seen.push(event);
    };
    bus.register<ChargeSubmitted>('billing.charge-submitted', handler);

    const response = await uploadReceipt(harness, payer, chargeId).expect(201);

    expect(response.body).toMatchObject({
      id: chargeId,
      status: 'en_revision',
      amountCents: 3333,
      firstSubmittedAt: harness.clock.now().toISOString(),
      allowedActions: ['uploadReceipt'], // RF-002-08: puede reemplazarlo
    });
    expect(response.body.currentReceipt).toMatchObject({
      method: 'qr',
      reference: 'TX-0001',
      mime: 'image/jpeg',
      sizeBytes: 2 * 1024 * 1024,
      status: 'vigente',
      fileAvailable: true,
    });
    expect(response.body.timeline.map((e: { type: string }) => e.type)).toContain(
      'comprobante_subido',
    );
    const event = response.body.timeline.find(
      (e: { type: string }) => e.type === 'comprobante_subido',
    );
    expect(event).toMatchObject({ fromStatus: 'pendiente', toStatus: 'en_revision' });
    expect(event.actor).toMatchObject({ userId: payer });

    // Guardado con clave generada por el servidor, sin el nombre original.
    const keys = [...harness.storage.files.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^receipts/${group.id}/${chargeId}/[0-9a-f-]{36}\\.jpg$`));
    expect(keys[0]).not.toContain('comprobante');
    expect(harness.storage.files.get(keys[0] as string)?.contentType).toBe('image/jpeg');
    expect(await activeReferences()).toEqual(['TX-0001']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ chargeId, groupId: group.id, userId: payer, replaced: false });
  });

  it('CA-002-04: acepta PNG y PDF por su firma binaria', async () => {
    await uploadReceipt(harness, payer, chargeId, {
      file: { bytes: pngBytes(), filename: 'a.png' },
      reference: 'PNG-1',
    }).expect(201);
    const second = await harness.insertCharge(group, other);
    const pdf = await uploadReceipt(harness, other, second, {
      file: { bytes: pdfBytes(), filename: 'a.pdf' },
      reference: 'PDF-1',
    }).expect(201);
    expect(pdf.body.currentReceipt.mime).toBe('application/pdf');
  });

  it('CA-002-05: un archivo de 6 MB se rechaza con 413 y el cobro no cambia', async () => {
    const before = await chargeRow(chargeId);

    const response = await uploadReceipt(harness, payer, chargeId, {
      file: { bytes: jpegBytes(6 * 1024 * 1024), filename: 'grande.jpg' },
    }).expect(413);

    expect(response.body).toMatchObject({ statusCode: 413, code: 'FILE_TOO_LARGE' });
    expect(await chargeRow(chargeId)).toEqual(before);
    expect(await receiptsOf(chargeId)).toEqual([]);
    expect(harness.storage.files.size).toBe(0);
    expect(await activeReferences()).toEqual([]);
  });

  it('CA-002-05: un .exe se rechaza con 415 y el cobro no cambia', async () => {
    const before = await chargeRow(chargeId);

    const response = await uploadReceipt(harness, payer, chargeId, {
      file: { bytes: exeBytes(), filename: 'virus.exe', contentType: 'application/x-msdownload' },
    }).expect(415);

    expect(response.body).toMatchObject({ statusCode: 415, code: 'UNSUPPORTED_FILE_TYPE' });
    expect(await chargeRow(chargeId)).toEqual(before);
    expect(harness.storage.files.size).toBe(0);
  });

  it('CA-002-05 / RNF-002-02: se valida el tipo real, no la extensión ni el MIME declarado', async () => {
    const response = await uploadReceipt(harness, payer, chargeId, {
      file: { bytes: exeBytes(), filename: 'foto.jpg', contentType: 'image/jpeg' },
    }).expect(415);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
  });

  it('CA-002-05: un archivo vacío se rechaza', async () => {
    await uploadReceipt(harness, payer, chargeId, {
      file: { bytes: Buffer.alloc(0), filename: 'vacio.jpg', contentType: 'image/jpeg' },
    }).expect((res) => {
      expect([400, 415]).toContain(res.status);
    });
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
  });

  it('CA-002-26: sin referencia se rechaza con 400 y el cobro no cambia de estado', async () => {
    const before = await chargeRow(chargeId);

    const response = await uploadReceipt(harness, payer, chargeId, { reference: null }).expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(response.body.details.fields).toHaveProperty('reference');
    expect(await chargeRow(chargeId)).toEqual(before);
    expect(harness.storage.files.size).toBe(0);
  });

  it('CA-002-26: una referencia en blanco o con caracteres no permitidos también da 400', async () => {
    for (const reference of ['   ', 'ref<script>', 'a'.repeat(101)]) {
      const response = await uploadReceipt(harness, payer, chargeId, { reference }).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
    expect(harness.storage.files.size).toBe(0);
  });

  it('RF-002-06: sin método, con método inválido o sin archivo responde 400', async () => {
    await uploadReceipt(harness, payer, chargeId, { method: null }).expect(400);
    await uploadReceipt(harness, payer, chargeId, { method: 'efectivo' }).expect(400);
    const noFile = await uploadReceipt(harness, payer, chargeId, { file: null }).expect(400);
    expect(noFile.body.code).toBe('VALIDATION_ERROR');
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
  });

  it('RN-002-08: first_submitted_at se fija con la primera subida y no cambia al reemplazar', async () => {
    const firstAt = harness.clock.now();
    await uploadReceipt(harness, payer, chargeId, { reference: 'R-1' }).expect(201);
    expect((await chargeRow(chargeId)).first_submitted_at).toEqual(firstAt);

    harness.clock.advance(3_600_000);
    const replaced = await uploadReceipt(harness, payer, chargeId, { reference: 'R-2' }).expect(
      201,
    );

    expect((await chargeRow(chargeId)).first_submitted_at).toEqual(firstAt);
    expect(replaced.body.firstSubmittedAt).toBe(firstAt.toISOString());
    const uploads = await harness.pool.query<{ uploaded_at: Date }>(
      'SELECT uploaded_at FROM receipts WHERE charge_id = $1 ORDER BY uploaded_at',
      [chargeId],
    );
    expect(uploads.rows[1]?.uploaded_at.getTime()).toBe(firstAt.getTime() + 3_600_000);
  });

  it('RF-002-08: reemplazar durante en_revision deja el anterior como reemplazado y libera su referencia', async () => {
    const bus = harness.app.get(TxEventBus);
    const seen: ChargeSubmitted[] = [];
    bus.register<ChargeSubmitted>('billing.charge-submitted', (_tx, event) => {
      seen.push(event);
    });
    await uploadReceipt(harness, payer, chargeId, { reference: 'VIEJA-1' }).expect(201);
    const firstKey = [...harness.storage.files.keys()][0] as string;
    harness.clock.advance(1000);

    const response = await uploadReceipt(harness, payer, chargeId, {
      reference: 'NUEVA-2',
      file: { bytes: pngBytes(), filename: 'n.png' },
    }).expect(201);

    expect(response.body.status).toBe('en_revision');
    expect(response.body.currentReceipt).toMatchObject({ reference: 'NUEVA-2', mime: 'image/png' });
    expect(response.body.receipts).toHaveLength(2);
    expect(await receiptsOf(chargeId)).toEqual([
      { status: 'reemplazado', reference: 'VIEJA-1' },
      { status: 'vigente', reference: 'NUEVA-2' },
    ]);
    // El anterior se conserva en el historial (archivo incluido) y su referencia queda libre.
    expect(harness.storage.files.has(firstKey)).toBe(true);
    expect(await activeReferences()).toEqual(['NUEVA-2']);
    expect(response.body.timeline.map((e: { type: string }) => e.type)).toEqual([
      'comprobante_subido',
      'comprobante_reemplazado',
    ]);
    expect(seen.map((e) => e.replaced)).toEqual([false, true]);
  });

  it('RF-002-08: al reemplazar se puede volver a usar la misma referencia', async () => {
    await uploadReceipt(harness, payer, chargeId, { reference: 'MISMA-1' }).expect(201);
    await uploadReceipt(harness, payer, chargeId, {
      reference: 'misma-1',
      file: { bytes: pngBytes(), filename: 'n.png' },
    }).expect(201);
    expect(await activeReferences()).toEqual(['MISMA-1']);
  });

  it('RF-002-06: un cobro atrasado también admite el comprobante (RN-002-01)', async () => {
    const late = await harness.insertCharge(group, other, { status: 'atrasado' });
    const response = await uploadReceipt(harness, other, late, { reference: 'LATE-1' }).expect(201);
    expect(response.body.status).toBe('en_revision');
    expect(response.body.timeline.at(-1)).toMatchObject({ fromStatus: 'atrasado' });
  });

  it('RN-002-11: quien salió del grupo con un cobro atrasado todavía puede pagar su deuda', async () => {
    const late = await harness.insertCharge(group, other, { status: 'atrasado' });
    await harness.leaveGroup(group.id, other, 'mora');
    const response = await uploadReceipt(harness, other, late, { reference: 'DEUDA-1' }).expect(
      201,
    );
    expect(response.body).toMatchObject({
      status: 'en_revision',
      member: { userId: other, isFormerMember: true },
    });
  });

  it('RF-002-06: un cobro pagado o cancelado responde 409 INVALID_TRANSITION', async () => {
    await harness.pool.query(
      `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
              settlement = 'manual' WHERE id = $1`,
      [chargeId, titular],
    );
    const response = await uploadReceipt(harness, payer, chargeId).expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
      message: 'Este cobro ya no admite cambios.',
      details: { from: 'pagado', action: 'uploadReceipt' },
    });
    expect(harness.storage.files.size).toBe(0);
  });

  it('RF-002-05: un grupo congelado responde 422 GROUP_FROZEN y no cambia nada', async () => {
    await harness.freezeGroup(group.id);
    const response = await uploadReceipt(harness, payer, chargeId).expect(422);
    expect(response.body).toMatchObject({ statusCode: 422, code: 'GROUP_FROZEN' });
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
    expect(harness.storage.files.size).toBe(0);
  });

  it('RF-002-06: una versión desactualizada responde 409 STALE_STATE', async () => {
    const response = await uploadReceipt(harness, payer, chargeId, { version: 99 }).expect(409);
    expect(response.body).toMatchObject({ code: 'STALE_STATE' });
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
    const ok = await uploadReceipt(harness, payer, chargeId, {
      version: (await chargeRow(chargeId)).version,
    }).expect(201);
    expect(ok.body.status).toBe('en_revision');
  });

  it('CA-002-13: el titular y otro miembro no pueden subir el comprobante de otro (403)', async () => {
    await uploadReceipt(harness, titular, chargeId).expect(403);
    await uploadReceipt(harness, other, chargeId).expect(403);
    expect((await chargeRow(chargeId)).status).toBe('pendiente');
    expect(harness.storage.files.size).toBe(0);
  });

  it('CA-002-23: una persona ajena al grupo recibe 404 al subir', async () => {
    const response = await uploadReceipt(harness, stranger, chargeId).expect(404);
    expect(response.body.code).toBe('NOT_FOUND');
    await request(harness.app.getHttpServer()).post(`/charges/${chargeId}/receipts`).expect(401);
  });

  it('RNF-002-03: si el almacén falla responde 503, el cobro no cambia y se puede reintentar', async () => {
    harness.storage.failPut = true;
    const before = await chargeRow(chargeId);

    const response = await uploadReceipt(harness, payer, chargeId).expect(503);

    expect(response.body).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(await chargeRow(chargeId)).toEqual(before);
    expect(await receiptsOf(chargeId)).toEqual([]);
    expect(await activeReferences()).toEqual([]);

    harness.storage.failPut = false;
    await uploadReceipt(harness, payer, chargeId).expect(201);
  });

  it('RNF-002-03: si la transacción falla después de guardar, se borra el archivo y se libera la referencia', async () => {
    const bus = harness.app.get(TxEventBus);
    let fail = true;
    bus.register<ChargeSubmitted>('billing.charge-submitted', () => {
      if (fail) throw new Error('fallo de prueba en un manejador');
    });
    const before = await chargeRow(chargeId);

    await uploadReceipt(harness, payer, chargeId, { reference: 'ROLLBACK-1' }).expect(500);

    expect(await chargeRow(chargeId)).toEqual(before);
    expect(await receiptsOf(chargeId)).toEqual([]);
    expect(await activeReferences()).toEqual([]);
    expect(harness.storage.files.size).toBe(0);
    expect(harness.storage.deleted).toHaveLength(1);

    fail = false;
    await uploadReceipt(harness, payer, chargeId, { reference: 'ROLLBACK-1' }).expect(201);
  });

  describe('GET /charges/:chargeId/receipts/:receiptId/file', () => {
    it('RNF-002-01: devuelve una URL firmada de 10 minutos como máximo al dueño y al titular', async () => {
      const uploaded = await uploadReceipt(harness, payer, chargeId).expect(201);
      const receiptId = uploaded.body.currentReceipt.id as string;

      for (const userId of [payer, titular]) {
        const response = await request(harness.app.getHttpServer())
          .get(`/charges/${chargeId}/receipts/${receiptId}/file`)
          .set('Authorization', `Bearer ${harness.token(userId)}`)
          .expect(200);
        expect(response.body.mime).toBe('image/jpeg');
        expect(response.body.url).toContain('ttl=600');
        expect(Date.parse(response.body.expiresAt)).toBe(harness.clock.now().getTime() + 600_000);
      }
    });

    it('RNF-002-01: un PDF se sirve como descarga (attachment)', async () => {
      const uploaded = await uploadReceipt(harness, payer, chargeId, {
        file: { bytes: pdfBytes(), filename: 'a.pdf' },
      }).expect(201);
      const response = await request(harness.app.getHttpServer())
        .get(`/charges/${chargeId}/receipts/${uploaded.body.currentReceipt.id}/file`)
        .set('Authorization', `Bearer ${harness.token(payer)}`)
        .expect(200);
      expect(response.body.mime).toBe('application/pdf');
      expect(response.body.url).toContain('download=');
    });

    it('RNF-002-01: la emisión se registra sin la URL ni la referencia', async () => {
      const uploaded = await uploadReceipt(harness, payer, chargeId, {
        reference: 'SECRETA-9',
      }).expect(201);
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await request(harness.app.getHttpServer())
        .get(`/charges/${chargeId}/receipts/${uploaded.body.currentReceipt.id}/file`)
        .set('Authorization', `Bearer ${harness.token(payer)}`)
        .expect(200);
      const lines = log.mock.calls.map((call) => JSON.stringify(call));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain('storage.test');
        expect(line).not.toContain('SECRETA-9');
      }
    });

    it('RN-002-06: tras la retención del archivo responde 410 FILE_DELETED', async () => {
      const uploaded = await uploadReceipt(harness, payer, chargeId).expect(201);
      const receiptId = uploaded.body.currentReceipt.id as string;
      await harness.pool.query('UPDATE receipts SET file_deleted_at = now() WHERE id = $1', [
        receiptId,
      ]);
      const response = await request(harness.app.getHttpServer())
        .get(`/charges/${chargeId}/receipts/${receiptId}/file`)
        .set('Authorization', `Bearer ${harness.token(payer)}`)
        .expect(410);
      expect(response.body).toMatchObject({ statusCode: 410, code: 'FILE_DELETED' });
    });

    it('RNF-002-01: un comprobante de otro cobro no se alcanza por este cobro (404)', async () => {
      const otherCharge = await harness.insertCharge(group, other);
      const foreign = await uploadReceipt(harness, other, otherCharge, { reference: 'AJENO-1' });
      const receiptId = foreign.body.currentReceipt.id as string;
      await request(harness.app.getHttpServer())
        .get(`/charges/${chargeId}/receipts/${receiptId}/file`)
        .set('Authorization', `Bearer ${harness.token(payer)}`)
        .expect(404);
    });

    it('RNF-002-01: si el almacén no puede firmar responde 503', async () => {
      const uploaded = await uploadReceipt(harness, payer, chargeId).expect(201);
      harness.storage.failSignedUrl = true;
      const response = await request(harness.app.getHttpServer())
        .get(`/charges/${chargeId}/receipts/${uploaded.body.currentReceipt.id}/file`)
        .set('Authorization', `Bearer ${harness.token(payer)}`)
        .expect(503);
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
