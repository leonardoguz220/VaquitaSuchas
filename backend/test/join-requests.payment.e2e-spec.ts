import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type { PaymentDataSent, ProofSubmitted } from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { RequestsRepository } from '../src/modules/join-requests/repositories/requests.repository.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';
import { exeBytes, jpegBytes, pdfBytes, pngBytes } from './support/receipt-files.js';

// Datos de pago, prórroga y comprobante de las solicitudes de ingreso (spec 010 US2 y US3,
// T019, T021 y T024) contra PostgreSQL real, con el almacén en memoria.
describe('Pago de ingreso de solicitudes', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;
  let requestId: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test => auth(http().get(url), userId);
  const post = (userId: string, url: string): request.Test => auth(http().post(url), userId);
  const put = (userId: string, url: string): request.Test => auth(http().put(url), userId);

  const sendPaymentData = (
    userId: string,
    id: string,
    fields: { text?: string; qr?: Buffer; version?: number } = {},
  ): request.Test => {
    let call = post(userId, `/join-requests/${id}/payment-data`);
    if (fields.text !== undefined) call = call.field('text', fields.text);
    if (fields.version !== undefined) call = call.field('version', String(fields.version));
    if (fields.qr) call = call.attach('qr', fields.qr, { filename: 'mi-qr.png' });
    return call;
  };
  const extend = (userId: string, id: string): request.Test =>
    post(userId, `/join-requests/${id}/extend`);
  const uploadProof = (
    userId: string,
    id: string,
    options: {
      file?: { bytes: Buffer; filename: string } | null;
      method?: string | null;
      reference?: string | null;
      version?: number;
    } = {},
  ): request.Test => {
    const file =
      options.file === undefined
        ? { bytes: jpegBytes(), filename: 'comprobante-privado.jpg' }
        : options.file;
    const method = options.method === undefined ? 'qr' : options.method;
    const reference = options.reference === undefined ? 'REF-0001' : options.reference;
    let call = post(userId, `/join-requests/${id}/proof`);
    if (method !== null) call = call.field('method', method);
    if (reference !== null) call = call.field('reference', reference);
    if (options.version !== undefined) call = call.field('version', String(options.version));
    if (file !== null) call = call.attach('file', file.bytes, { filename: file.filename });
    return call;
  };

  interface Row {
    status: string;
    version: number;
    pay_deadline_at: Date | null;
    decision_deadline_at: Date | null;
    extended_at: Date | null;
    quote_amount_cents: string | null;
    quote_member_count: number | null;
    quote_exchange_rate: string | null;
    payment_qr_key: string | null;
    proof_key: string | null;
    proof_reference: string | null;
    final_reason: string | null;
  }
  const row = async (id: string): Promise<Row> =>
    (
      await harness.pool.query<Row>(
        `SELECT status, version, pay_deadline_at, decision_deadline_at, extended_at,
                quote_amount_cents::text, quote_member_count, quote_exchange_rate::text,
                payment_qr_key, proof_key, proof_reference, final_reason
           FROM join_requests WHERE id = $1`,
        [id],
      )
    ).rows[0] as Row;
  const eventTypes = async (id: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at',
        [id],
      )
    ).rows.map((r) => r.type);
  const activeReferences = async (groupId = group.id): Promise<string[]> =>
    (
      await harness.pool.query<{ reference_key: string }>(
        `SELECT reference_key FROM payment_references
          WHERE group_id = $1 AND released_at IS NULL ORDER BY reference_key`,
        [groupId],
      )
    ).rows.map((r) => r.reference_key);
  const minutesAfterNow = (n: number): string =>
    new Date(Date.parse(NOW) + n * 60_000).toISOString();

  /** Lleva la solicitud a `esperando_pago` por el endpoint (con la cotización real). */
  async function toAwaitingPayment(id: string = requestId): Promise<void> {
    await sendPaymentData(group.ownerId, id).expect(200);
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 }); // titular + 1 = 2 miembros, 5 cupos
    await harness.pool.query('UPDATE groups SET price_cents = 9000 WHERE id = $1', [group.id]);
    applicant = await harness.insertUser();
    requestId = await seedRequest(harness, group, applicant, 'abierta');
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
    harness.storage.failPut = false;
    harness.storage.failSignedUrl = false;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('POST /join-requests/:id/payment-data', () => {
    it('CA-010-04 y RF-010-11: Bs 90 con 2 miembros → cuota Bs 30, esperando_pago, vence en 15 min', async () => {
      const seen: PaymentDataSent[] = [];
      harness.app
        .get(TxEventBus, { strict: false })
        .register<PaymentDataSent>('join-requests.payment-data-sent', (_tx, event) => {
          if (event.requestId === requestId) seen.push(event);
        });

      const response = await sendPaymentData(group.ownerId, requestId).expect(200);

      expect(response.body.phase).toMatchObject({
        status: 'esperando_pago',
        deadlineAt: minutesAfterNow(15),
        deadlineKind: 'pago',
        serverNow: NOW,
      });
      expect(response.body.quote).toEqual({
        amountCents: 3000,
        priceCents: 9000,
        currency: 'BS',
        exchangeRate: null,
        totalBsCents: 9000,
        memberCount: 2,
      });
      // Sin texto ni QR propios: los datos de pago del grupo (RF-001-20).
      expect(response.body.paymentInfo).toEqual({
        text: 'Transferir a la cuenta 123',
        qrAvailable: false,
      });
      expect(response.body.extended).toBe(false);
      expect(response.body.timeline.map((e: { type: string }) => e.type)).toEqual([
        'abierta',
        'datos_pago_enviados',
      ]);
      expect(response.body.allowedActions).toEqual(
        expect.arrayContaining(['extend', 'cashPayment', 'reject']),
      );
      expect(seen).toEqual([
        expect.objectContaining({
          groupId: group.id,
          applicantId: applicant,
          hostId: group.ownerId,
          amountCents: 3000,
          payDeadlineAt: new Date(minutesAfterNow(15)),
        }),
      ]);
    });

    it('RF-010-11: el titular puede enviar su propio texto y QR; el QR queda con clave generada', async () => {
      const response = await sendPaymentData(group.ownerId, requestId, {
        text: ' Cuenta nueva 999 ',
        qr: pngBytes(),
      }).expect(200);

      expect(response.body.paymentInfo).toEqual({ text: 'Cuenta nueva 999', qrAvailable: true });
      const key = (await row(requestId)).payment_qr_key as string;
      expect(key).toMatch(
        new RegExp(`^join-requests/${group.id}/${requestId}/qr-[0-9a-f-]{36}\\.png$`),
      );
      expect(key).not.toContain('mi-qr');
      expect(harness.storage.files.get(key)?.contentType).toBe('image/png');
    });

    it('RF-010-11 y plan: sin datos propios copia el QR del grupo; una copia propia no depende del grupo', async () => {
      // El titular sube el QR del grupo por el endpoint real (spec 001, RF-001-20).
      await put(group.ownerId, `/groups/${group.id}/payment-info`)
        .attach('qr', pngBytes(), { filename: 'qr-del-grupo.png' })
        .expect(200);
      const groupQr = (
        await harness.pool.query<{ payment_qr_key: string }>(
          'SELECT payment_qr_key FROM groups WHERE id = $1',
          [group.id],
        )
      ).rows[0]?.payment_qr_key as string;
      expect(groupQr).toMatch(new RegExp(`^groups/${group.id}/qr/[0-9a-f-]{36}\\.png$`));

      const response = await sendPaymentData(group.ownerId, requestId).expect(200);

      expect(response.body.paymentInfo.qrAvailable).toBe(true);
      const copy = (await row(requestId)).payment_qr_key as string;
      expect(copy).not.toBe(groupQr);
      // Si el grupo borra su QR por el endpoint, la solicitud conserva el suyo.
      await put(group.ownerId, `/groups/${group.id}/payment-info`)
        .field('removeQr', 'true')
        .expect(200);
      expect(harness.storage.files.has(groupQr)).toBe(false);
      expect(harness.storage.files.has(copy)).toBe(true);
      const qr = await get(applicant, `/join-requests/${requestId}/payment-qr`).expect(200);
      expect(qr.body.mime).toBe('image/png');
      expect(qr.body.url).toContain(copy);
    });

    it('RF-010-11: un QR de más de 2 MB o que no es imagen se rechaza y la solicitud sigue abierta', async () => {
      const big = await sendPaymentData(group.ownerId, requestId, {
        qr: pngBytes(2 * 1024 * 1024 + 1),
      }).expect(413);
      expect(big.body.code).toBe('FILE_TOO_LARGE');
      const pdf = await sendPaymentData(group.ownerId, requestId, { qr: pdfBytes() }).expect(415);
      expect(pdf.body.code).toBe('UNSUPPORTED_FILE_TYPE');
      await sendPaymentData(group.ownerId, requestId, { text: 'x'.repeat(501) }).expect(400);
      expect((await row(requestId)).status).toBe('abierta');
      expect(harness.storage.files.size).toBe(0);
    });

    it('PAYMENT_INFO_MISSING: sin datos propios y sin datos configurados en el grupo → 422 y sigue abierta', async () => {
      await harness.pool.query('UPDATE groups SET payment_info_text = NULL WHERE id = $1', [
        group.id,
      ]);

      const response = await sendPaymentData(group.ownerId, requestId).expect(422);

      expect(response.body.code).toBe('PAYMENT_INFO_MISSING');
      expect(response.body.details.rule).toBe('RF-001-20');
      expect((await row(requestId)).status).toBe('abierta');
    });

    it('CA-010-26: la cuota cotizada no cambia si el titular cambia el tipo de cambio', async () => {
      await harness.pool.query(
        `UPDATE groups SET currency = 'USD', price_cents = 1000, exchange_rate = 9 WHERE id = $1`,
        [group.id],
      );
      const first = await sendPaymentData(group.ownerId, requestId).expect(200);
      expect(first.body.quote).toMatchObject({
        amountCents: 3000,
        priceCents: 1000,
        currency: 'USD',
        exchangeRate: '9.0000',
        totalBsCents: 9000,
      });

      await harness.pool.query('UPDATE groups SET exchange_rate = 10 WHERE id = $1', [group.id]);
      const after = await get(applicant, `/join-requests/${requestId}`).expect(200);

      expect(after.body.quote).toEqual(first.body.quote);
      expect(after.body.estimatedShareCents).toBe(3333); // lo estimado sí sigue al grupo
      expect((await row(requestId)).quote_exchange_rate).toBe('9.0000');
    });

    it('RN-010-10: si cambia el número de miembros, la cuota ya cotizada se mantiene', async () => {
      await toAwaitingPayment();
      await harness.leaveGroup(group.id, group.memberIds[0] as string);

      const after = await get(group.ownerId, `/join-requests/${requestId}`).expect(200);

      expect(after.body.quote).toMatchObject({ amountCents: 3000, memberCount: 2 });
    });

    it('CA-010-38 y RN-010-12: abierta a las 23:50 del último día sigue su curso; otras abiertas ya no pueden recibir datos de pago', async () => {
      const [first, other] = [await harness.insertUser(), await harness.insertUser()];
      const openedAt = '2026-10-18T10:00:00.000Z';
      // Su plazo está limitado por el fin de la ventana (19 oct 00:00 La Paz = 04:00 UTC).
      const a = await seedRequest(harness, group, first, 'abierta', {
        openedAt,
        openMinutes: 18 * 60,
      });
      const b = await seedRequest(harness, group, other, 'abierta', {
        openedAt,
        openMinutes: 18 * 60,
      });

      setClock(harness, '2026-10-19T03:50:00.000Z'); // 23:50 de La Paz
      await sendPaymentData(group.ownerId, a).expect(200);
      setClock(harness, '2026-10-19T04:02:00.000Z'); // ya pasó la medianoche

      // La que estaba en esperando_pago puede completarse con sus plazos normales.
      await uploadProof(first, a).expect(200);
      expect((await row(a)).status).toBe('pago_informado');
      // La otra ya no admite datos de pago: la ventana terminó.
      const late = await sendPaymentData(group.ownerId, b).expect(422);
      expect(late.body.code).toBe('ENTRY_WINDOW_CLOSED');
      expect(late.body.details.rule).toBe('RF-001-22');
      expect(await row(b)).toMatchObject({ status: 'expirada', final_reason: 'ventana_cerrada' });
    });

    it('RF-010-12 y RN-010-02: sin cupo el titular no puede enviar datos de pago y la solicitud sigue abierta', async () => {
      const full = await harness.createGroup({ members: 4 }); // 5 de 5
      const user = await harness.insertUser();
      const id = await seedRequest(harness, full, user, 'abierta');

      const response = await sendPaymentData(full.ownerId, id).expect(422);

      expect(response.body.code).toBe('NO_SLOTS_AVAILABLE');
      expect(response.body.details.rule).toBe('RN-010-02');
      expect((await row(id)).status).toBe('abierta');
    });

    it('RN-010-02: un cupo reservado por otra solicitud cuenta; uno vencido no', async () => {
      const g = await harness.createGroup({ members: 3 }); // 4 de 5: un cupo
      const [u1, u2] = [await harness.insertUser(), await harness.insertUser()];
      const r1 = await seedRequest(harness, g, u1, 'abierta');
      const r2 = await seedRequest(harness, g, u2, 'abierta');
      await sendPaymentData(g.ownerId, r1).expect(200);

      const blocked = await sendPaymentData(g.ownerId, r2).expect(422);
      expect(blocked.body.code).toBe('NO_SLOTS_AVAILABLE');

      setClock(harness, minutesAfterNow(16)); // el plazo de r1 venció aunque nadie lo persistió
      await sendPaymentData(g.ownerId, r2).expect(200);
      expect((await row(r2)).status).toBe('esperando_pago');
    });

    it('INVALID_TRANSITION y RNF-010-03: fuera de abierta → 409; una abierta vencida se persiste como expirada', async () => {
      await toAwaitingPayment();
      const again = await sendPaymentData(group.ownerId, requestId).expect(409);
      expect(again.body.code).toBe('INVALID_TRANSITION');

      const stale = await seedRequest(harness, group, await harness.insertUser(), 'abierta', {
        openedAt: '2026-10-15T10:00:00.000Z', // sus 24 h vencieron ayer, nadie lo persistió
      });
      const expired = await sendPaymentData(group.ownerId, stale).expect(409);
      expect(expired.body.code).toBe('INVALID_TRANSITION');
      expect(await row(stale)).toMatchObject({
        status: 'expirada',
        final_reason: 'plazo_solicitud',
      });
    });

    it('GROUP_FROZEN, STALE_STATE y permisos: congelado 422; versión vieja 409; solicitante 403; miembro 403; ajeno 404', async () => {
      const stale = await sendPaymentData(group.ownerId, requestId, { version: 99 }).expect(409);
      expect(stale.body.code).toBe('STALE_STATE');
      await sendPaymentData(applicant, requestId).expect(403);
      await sendPaymentData(group.memberIds[0] as string, requestId).expect(403);
      await sendPaymentData(await harness.insertUser(), requestId).expect(404);
      expect((await row(requestId)).status).toBe('abierta');

      await harness.freezeGroup(group.id);
      const frozen = await sendPaymentData(group.ownerId, requestId).expect(422);
      expect(frozen.body.code).toBe('GROUP_FROZEN');
      expect((await row(requestId)).status).toBe('abierta');
    });

    it('503: si el almacén falla al guardar el QR no cambia nada', async () => {
      harness.storage.failPut = true;

      const response = await sendPaymentData(group.ownerId, requestId, { qr: pngBytes() }).expect(
        503,
      );

      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(await row(requestId)).toMatchObject({ status: 'abierta', payment_qr_key: null });
      expect(await eventTypes(requestId)).toEqual(['abierta']);
    });

    it('compensación: si la transacción falla después de guardar el QR, el archivo se borra', async () => {
      jest
        .spyOn(RequestsRepository.prototype, 'recordPaymentData')
        .mockRejectedValueOnce(new Error('falla simulada'));

      await sendPaymentData(group.ownerId, requestId, { qr: pngBytes() }).expect(500);

      expect(harness.storage.files.size).toBe(0);
      expect(harness.storage.deleted).toHaveLength(1);
      expect((await row(requestId)).status).toBe('abierta');
    });
  });

  describe('POST /join-requests/:id/extend', () => {
    it('CA-010-42 y RF-010-28: concede 15 minutos más una sola vez y queda en la línea de tiempo', async () => {
      await toAwaitingPayment();

      const first = await extend(group.ownerId, requestId).expect(200);

      expect(first.body.extended).toBe(true);
      expect(first.body.phase).toMatchObject({
        status: 'esperando_pago',
        deadlineAt: minutesAfterNow(30),
      });
      expect(first.body.allowedActions).not.toContain('extend');
      expect(await eventTypes(requestId)).toEqual([
        'abierta',
        'datos_pago_enviados',
        'plazo_prorrogado',
      ]);

      const second = await extend(group.ownerId, requestId).expect(422);
      expect(second.body.code).toBe('ALREADY_EXTENDED');
      expect(second.body.details.rule).toBe('RF-010-28');
      expect((await row(requestId)).pay_deadline_at).toEqual(new Date(minutesAfterNow(30)));
    });

    it('CA-010-42: dos prórrogas simultáneas conceden solo una', async () => {
      await toAwaitingPayment();

      const results = await Promise.all([
        extend(group.ownerId, requestId),
        extend(group.ownerId, requestId),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
      expect((await row(requestId)).pay_deadline_at).toEqual(new Date(minutesAfterNow(30)));
    });

    it('RF-010-28: abierta, vencida o con otro rol no se prorroga', async () => {
      const early = await extend(group.ownerId, requestId).expect(409);
      expect(early.body.code).toBe('INVALID_TRANSITION');

      await toAwaitingPayment();
      await extend(applicant, requestId).expect(403);
      await extend(await harness.insertUser(), requestId).expect(404);

      setClock(harness, minutesAfterNow(16));
      const late = await extend(group.ownerId, requestId).expect(409);
      expect(late.body.code).toBe('INVALID_TRANSITION');
      expect(await row(requestId)).toMatchObject({
        status: 'expirada',
        final_reason: 'plazo_pago',
      });
    });
  });

  describe('POST /join-requests/:id/proof', () => {
    it('CA-010-07: un JPG de 2 MB con referencia a tiempo pasa a pago_informado con 60 min de decisión', async () => {
      await toAwaitingPayment();
      setClock(harness, minutesAfterNow(10));
      const seen: ProofSubmitted[] = [];
      harness.app
        .get(TxEventBus, { strict: false })
        .register<ProofSubmitted>('join-requests.proof-submitted', (_tx, event) => {
          if (event.requestId === requestId) seen.push(event);
        });

      const response = await uploadProof(applicant, requestId, { reference: ' tx-0001 ' }).expect(
        200,
      );

      expect(response.body.phase).toMatchObject({
        status: 'pago_informado',
        deadlineAt: minutesAfterNow(70),
        deadlineKind: 'decision',
      });
      expect(response.body.proof).toMatchObject({
        method: 'qr',
        reference: 'tx-0001',
        mime: 'image/jpeg',
        sizeBytes: 2 * 1024 * 1024,
        fileAvailable: true,
      });
      expect(response.body.timeline.map((e: { type: string }) => e.type)).toContain(
        'comprobante_subido',
      );
      const key = (await row(requestId)).proof_key as string;
      expect(key).toMatch(
        new RegExp(`^join-requests/${group.id}/${requestId}/proof-[0-9a-f-]{36}\\.jpg$`),
      );
      expect(key).not.toContain('comprobante-privado');
      expect(await activeReferences()).toEqual(['TX-0001']);
      expect(seen).toEqual([
        expect.objectContaining({
          requestId,
          decisionDeadlineAt: new Date(minutesAfterNow(70)),
        }),
      ]);
    });

    it('CA-010-08: 6 MB → 413 y un .exe → 415; el estado no cambia y no se guarda nada', async () => {
      await toAwaitingPayment();
      const before = await row(requestId);

      const big = await uploadProof(applicant, requestId, {
        file: { bytes: jpegBytes(6 * 1024 * 1024), filename: 'grande.jpg' },
      }).expect(413);
      const exe = await uploadProof(applicant, requestId, {
        file: { bytes: exeBytes(), filename: 'virus.exe' },
      }).expect(415);

      expect(big.body.code).toBe('FILE_TOO_LARGE');
      expect(exe.body.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(await row(requestId)).toEqual(before);
      expect(harness.storage.files.size).toBe(0);
      expect(await activeReferences()).toEqual([]);
    });

    it('CA-010-10 y RN-010-06: con el plazo vencido → PAYMENT_DEADLINE_PASSED y la solicitud queda expirada', async () => {
      await toAwaitingPayment();
      setClock(harness, minutesAfterNow(15)); // el plazo es exclusivo: a los 15:00 ya venció

      const response = await uploadProof(applicant, requestId).expect(422);

      expect(response.body.code).toBe('PAYMENT_DEADLINE_PASSED');
      expect(response.body.details.rule).toBe('RN-010-06');
      expect(await row(requestId)).toMatchObject({
        status: 'expirada',
        final_reason: 'plazo_pago',
        proof_key: null,
      });
      expect(harness.storage.files.size).toBe(0);
      expect(await activeReferences()).toEqual([]);
      // El chat queda en lectura: la línea de tiempo registra el vencimiento.
      expect(await eventTypes(requestId)).toContain('expirada');
    });

    it('CA-010-10: con la prórroga el plazo de pago es de 30 minutos', async () => {
      await toAwaitingPayment();
      await extend(group.ownerId, requestId).expect(200);
      setClock(harness, minutesAfterNow(29));

      await uploadProof(applicant, requestId).expect(200);
    });

    it('CA-010-40: sin referencia, sin método o sin archivo → 400 y el estado no cambia', async () => {
      await toAwaitingPayment();
      const before = await row(requestId);

      for (const options of [
        { reference: null },
        { reference: '   ' },
        { reference: 'x'.repeat(101) },
        { reference: 'con ñ y @' },
        { method: null },
        { method: 'efectivo' },
        { file: null },
      ]) {
        const response = await uploadProof(applicant, requestId, options).expect(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      }

      expect(await row(requestId)).toEqual(before);
      expect(await activeReferences()).toEqual([]);
      expect(harness.storage.files.size).toBe(0);
    });

    it('CA-010-41 y RN-010-14: una referencia repetida en el grupo se rechaza; liberada o en otro grupo se acepta', async () => {
      const other = await harness.insertUser();
      const second = await seedRequest(harness, group, other, 'abierta');
      await toAwaitingPayment();
      await toAwaitingPayment(second);
      await uploadProof(applicant, requestId, { reference: 'ref-77' }).expect(200);

      const repeated = await uploadProof(other, second, { reference: 'REF-77' }).expect(409);

      expect(repeated.body.code).toBe('REFERENCE_ALREADY_USED');
      expect(repeated.body.details.rule).toBe('RN-010-14');
      expect((await row(second)).status).toBe('esperando_pago');
      expect(harness.storage.files.size).toBe(1);

      // Un comprobante rechazado libera su referencia.
      await harness.pool.query(
        `UPDATE payment_references SET released_at = now()
          WHERE group_id = $1 AND reference_key = 'REF-77'`,
        [group.id],
      );
      await uploadProof(other, second, { reference: 'REF-77' }).expect(200);

      // La misma referencia en otro grupo es válida.
      const otherGroup = await harness.createGroup({ members: 1 });
      const third = await seedRequest(harness, otherGroup, await harness.insertUser(), 'abierta');
      await toAwaitingPayment3(otherGroup, third);
      const thirdApplicant = (
        await harness.pool.query<{ applicant_id: string }>(
          'SELECT applicant_id FROM join_requests WHERE id = $1',
          [third],
        )
      ).rows[0]?.applicant_id as string;
      await uploadProof(thirdApplicant, third, { reference: 'REF-77' }).expect(200);
    });

    it('CA-010-41: dos comprobantes simultáneos con la misma referencia dejan uno solo', async () => {
      const other = await harness.insertUser();
      const second = await seedRequest(harness, group, other, 'abierta');
      await toAwaitingPayment();
      await toAwaitingPayment(second);

      const results = await Promise.all([
        uploadProof(applicant, requestId, { reference: 'DUP-1' }),
        uploadProof(other, second, { reference: 'DUP-1' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await activeReferences()).toEqual(['DUP-1']);
      expect(harness.storage.files.size).toBe(1);
    });

    it('INVALID_TRANSITION, permisos y STALE_STATE: abierta o ya informada 409; titular o miembro 403; ajeno 404; versión vieja 409', async () => {
      const early = await uploadProof(applicant, requestId).expect(409);
      expect(early.body.code).toBe('INVALID_TRANSITION');

      await toAwaitingPayment();
      await uploadProof(group.ownerId, requestId).expect(403);
      await uploadProof(group.memberIds[0] as string, requestId).expect(403);
      await uploadProof(await harness.insertUser(), requestId).expect(404);
      const stale = await uploadProof(applicant, requestId, { version: 99 }).expect(409);
      expect(stale.body.code).toBe('STALE_STATE');

      await uploadProof(applicant, requestId).expect(200);
      const again = await uploadProof(applicant, requestId, { reference: 'OTRA' }).expect(409);
      expect(again.body.code).toBe('INVALID_TRANSITION');
      expect(await activeReferences()).toEqual(['REF-0001']);
    });

    it('503 y compensación: si el almacén falla no se reserva la referencia; si la transacción falla después de guardar, se borra el archivo', async () => {
      await toAwaitingPayment();
      harness.storage.failPut = true;
      const down = await uploadProof(applicant, requestId).expect(503);
      expect(down.body.code).toBe('SERVICE_UNAVAILABLE');
      expect((await row(requestId)).status).toBe('esperando_pago');
      expect(await activeReferences()).toEqual([]);

      harness.storage.failPut = false;
      jest
        .spyOn(RequestsRepository.prototype, 'recordProof')
        .mockRejectedValueOnce(new Error('falla simulada'));
      await uploadProof(applicant, requestId).expect(500);
      expect(harness.storage.files.size).toBe(0);
      expect(harness.storage.deleted).toHaveLength(1);
      expect(await activeReferences()).toEqual([]);
      expect((await row(requestId)).status).toBe('esperando_pago');
    });

    it('RNF-010-02: ni la referencia ni el nombre del archivo ni las URLs firmadas llegan a los logs', async () => {
      const logged: string[] = [];
      for (const level of ['log', 'warn', 'debug', 'verbose'] as const) {
        jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
      }
      await toAwaitingPayment();
      harness.storage.failPut = true;
      await uploadProof(applicant, requestId, { reference: 'SECRETA-123' }).expect(503);
      harness.storage.failPut = false;
      await uploadProof(applicant, requestId, { reference: 'SECRETA-123' }).expect(200);
      await get(applicant, `/join-requests/${requestId}/proof/file`).expect(200);

      const text = logged.join('\n');
      expect(text).not.toContain('SECRETA');
      expect(text).not.toContain('comprobante-privado');
      expect(text).not.toContain('https://storage.test');
    });
  });

  describe('GET /join-requests/:id/proof/file y /payment-qr', () => {
    it('RNF-010-02: el solicitante y el titular reciben una URL firmada de 10 minutos como máximo', async () => {
      await toAwaitingPayment();
      await uploadProof(applicant, requestId, {
        file: { bytes: pdfBytes(), filename: 'a.pdf' },
      }).expect(200);

      for (const userId of [applicant, group.ownerId]) {
        const response = await get(userId, `/join-requests/${requestId}/proof/file`).expect(200);
        expect(response.body.mime).toBe('application/pdf');
        expect(response.body.url).toContain('ttl=600');
        expect(response.body.expiresAt).toBe(minutesAfterNow(10));
      }
    });

    it('RNF-010-01: otro miembro 403, ajeno 404, sin comprobante o sin QR 404', async () => {
      await get(applicant, `/join-requests/${requestId}/proof/file`).expect(404);
      await get(applicant, `/join-requests/${requestId}/payment-qr`).expect(404);
      await toAwaitingPayment();
      await uploadProof(applicant, requestId).expect(200);

      await get(group.memberIds[0] as string, `/join-requests/${requestId}/proof/file`).expect(403);
      await get(await harness.insertUser(), `/join-requests/${requestId}/proof/file`).expect(404);
      await get(applicant, `/join-requests/${requestId}/payment-qr`).expect(404);
    });

    it('410 FILE_DELETED tras la retención y 503 si el almacén falla', async () => {
      await toAwaitingPayment();
      await uploadProof(applicant, requestId).expect(200);

      harness.storage.failSignedUrl = true;
      const down = await get(applicant, `/join-requests/${requestId}/proof/file`).expect(503);
      expect(down.body.code).toBe('SERVICE_UNAVAILABLE');
      harness.storage.failSignedUrl = false;

      await harness.pool.query('UPDATE join_requests SET content_purged_at = now() WHERE id = $1', [
        requestId,
      ]);
      const gone = await get(applicant, `/join-requests/${requestId}/proof/file`).expect(410);
      expect(gone.body.code).toBe('FILE_DELETED');
    });
  });

  /** `toAwaitingPayment` para una solicitud de otro grupo. */
  async function toAwaitingPayment3(g: TestGroup, id: string): Promise<void> {
    await sendPaymentData(g.ownerId, id).expect(200);
  }
});
