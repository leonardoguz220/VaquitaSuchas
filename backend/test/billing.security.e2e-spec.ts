import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { jpegBytes, pdfBytes, uploadReceipt } from './support/receipt-files.js';

// Seguridad del módulo de cobros (spec 002 T042): URLs firmadas, logs sin datos del usuario, motivos
// fuera del historial público y PDF como descarga, contra PostgreSQL real.
describe('Seguridad de cobros y comprobantes', () => {
  const harness = new BillingHarness();
  const SECRETS = {
    refA1: 'REF-PRIVADA-A1',
    refA2: 'REF-PRIVADA-A2',
    fileA1: 'mi-comprobante-privado.jpg',
    fileA2: 'segundo-archivo-privado.pdf',
    reject: 'MOTIVO-RECHAZO-SECRETO',
    cancel: 'MOTIVO-CANCELA-SECRETO',
  };

  let group: TestGroup;
  let payer: string;
  let cancelled: string;
  let other: string;
  let chargeId: string;
  let cancelledChargeId: string;
  let receiptId: string;
  const logged: string[] = [];
  const restores: (() => void)[] = [];

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const as = (userId: string, test: request.Test): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const post = (userId: string, url: string, body: object): request.Test =>
    as(userId, http().post(url)).send(body);

  beforeAll(async () => {
    await harness.start();
    for (const method of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest
        .spyOn(Logger.prototype, method)
        .mockImplementation((...args: unknown[]) => void logged.push(JSON.stringify(args)));
    }
    for (const stream of [process.stdout, process.stderr]) {
      const original = stream.write;
      stream.write = function (this: unknown, chunk: unknown, ...rest: never[]) {
        logged.push(String(chunk));
        return (original as (...args: unknown[]) => boolean).call(stream, chunk, ...rest);
      } as typeof stream.write;
      restores.push(() => {
        stream.write = original;
      });
    }
    group = await harness.createGroup({ members: 3 });
    [payer, cancelled, other] = group.memberIds as [string, string, string];
    chargeId = await harness.insertCharge(group, payer);
    cancelledChargeId = await harness.insertCharge(group, cancelled);

    // Sube un JPG, el titular lo rechaza con motivo y se reemplaza por un PDF.
    await uploadReceipt(harness, payer, chargeId, {
      reference: SECRETS.refA1,
      file: { bytes: jpegBytes(2048), filename: SECRETS.fileA1, contentType: 'image/jpeg' },
    }).expect(201);
    await post(group.ownerId, `/charges/${chargeId}/reject`, {
      reason: SECRETS.reject,
      invalidReceipt: false,
    }).expect(200);
    const second = await uploadReceipt(harness, payer, chargeId, {
      reference: SECRETS.refA2,
      file: { bytes: pdfBytes(2048), filename: SECRETS.fileA2, contentType: 'application/pdf' },
    }).expect(201);
    receiptId = second.body.currentReceipt.id as string;
    await post(group.ownerId, `/charges/${cancelledChargeId}/cancel`, {
      reason: SECRETS.cancel,
    }).expect(200);
  }, 60_000);

  afterAll(async () => {
    restores.forEach((restore) => restore());
    jest.restoreAllMocks();
    await harness.stop();
  }, 30_000);

  const fileUrl = (userId: string): request.Test =>
    as(userId, http().get(`/charges/${chargeId}/receipts/${receiptId}/file`));

  it('RNF-002-01: la URL firmada dura 10 minutos como máximo para el dueño y el titular', async () => {
    for (const userId of [payer, group.ownerId]) {
      const response = await fileUrl(userId).expect(200);

      expect(response.body.url).toContain('ttl=600');
      expect(
        Date.parse(response.body.expiresAt) - harness.clock.now().getTime(),
      ).toBeLessThanOrEqual(600_000);
    }
  });

  it('RNF-002-01: un PDF se sirve con descarga forzada (attachment) y los demás reciben 403 o 404', async () => {
    const response = await fileUrl(payer).expect(200);
    expect(response.body.mime).toBe('application/pdf');
    expect(response.body.url).toContain('download=');

    await fileUrl(other).expect(403);
    await fileUrl(await harness.insertUser()).expect(404);
  });

  it('RNF-002-01: el cobro nunca lleva URLs firmadas ni la clave del archivo en el almacén', async () => {
    const detail = await as(payer, http().get(`/charges/${chargeId}`)).expect(200);
    const key = (
      await harness.pool.query<{ file_key: string }>(
        'SELECT file_key FROM receipts WHERE id = $1',
        [receiptId],
      )
    ).rows[0]?.file_key as string;

    const text = JSON.stringify(detail.body);
    expect(text).not.toContain('storage.test');
    expect(text).not.toContain(key);
  });

  it('RNF-002-07: el historial público no muestra motivos de rechazo ni de cancelación', async () => {
    const history = await as(other, http().get(`/groups/${group.id}/charges`)).expect(200);
    const summary = await as(other, http().get(`/groups/${group.id}/billing/summary`)).expect(200);

    for (const text of [JSON.stringify(history.body), JSON.stringify(summary.body)]) {
      expect(text).not.toContain(SECRETS.reject);
      expect(text).not.toContain(SECRETS.cancel);
      expect(text).not.toContain('"reason"');
      expect(text).not.toContain('"receipts"');
    }
    // El historial sí trae los cobros: la prueba no es vacía.
    expect(history.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('RNF-002-07: los demás miembros no reciben la referencia, el comprobante ni el motivo', async () => {
    for (const id of [chargeId, cancelledChargeId]) {
      const response = await as(other, http().get(`/charges/${id}`)).expect(403);
      const text = JSON.stringify(response.body);
      for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    }
  });

  it('RNF-002-07: el titular y el dueño sí ven el motivo del rechazo (la prueba no es vacía)', async () => {
    const owner = await as(group.ownerId, http().get(`/charges/${chargeId}`)).expect(200);
    const mine = await as(payer, http().get(`/charges/${chargeId}`)).expect(200);

    expect(JSON.stringify(owner.body)).toContain(SECRETS.reject);
    expect(JSON.stringify(mine.body)).toContain(SECRETS.reject);
  });

  it('RNF-002-02: la clave del archivo es generada y no lleva el nombre que puso la persona', async () => {
    const keys = await harness.pool.query<{ file_key: string }>(
      'SELECT file_key FROM receipts WHERE charge_id = $1 ORDER BY uploaded_at',
      [chargeId],
    );

    expect(keys.rows).toHaveLength(2);
    expect(keys.rows[0]?.file_key).toMatch(
      new RegExp(`^receipts/${group.id}/${chargeId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(keys.rows[1]?.file_key).toMatch(
      new RegExp(`^receipts/${group.id}/${chargeId}/[0-9a-f-]{36}\\.pdf$`),
    );
    const stored = await harness.pool.query('SELECT * FROM receipts WHERE charge_id = $1', [
      chargeId,
    ]);
    expect(JSON.stringify(stored.rows)).not.toContain('privado');
  });

  it('RNF-002-01: los registros no incluyen URLs firmadas, referencias, nombres de archivo ni motivos', async () => {
    await fileUrl(payer).expect(200);
    await fileUrl(group.ownerId).expect(200);

    const output = logged.join('\n');
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain('storage.test');
    for (const secret of Object.values(SECRETS)) expect(output).not.toContain(secret);
  });
});
