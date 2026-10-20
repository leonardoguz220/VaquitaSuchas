import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type {
  JoinRequestCancelled,
  JoinRequestRejected,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest, setClock, type SeedState } from './support/join-requests-fixtures.js';
import { jpegBytes } from './support/receipt-files.js';

// Rechazo del titular y cancelación del solicitante (spec 010 US4, T028/T029).
describe('Rechazar y cancelar solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test => auth(http().get(url), userId);
  const post = (userId: string, url: string, body: object = {}): request.Test =>
    auth(http().post(url), userId).send(body);
  const reject = (userId: string, id: string, body: object): request.Test =>
    post(userId, `/join-requests/${id}/reject`, body);
  const cancel = (userId: string, id: string): request.Test =>
    post(userId, `/join-requests/${id}/cancel`);

  const requestRow = async (id: string) =>
    (
      await harness.pool.query(
        `SELECT status, final_reason, reject_reason, rejected_as_false, decided_by
           FROM join_requests WHERE id = $1`,
        [id],
      )
    ).rows[0] as {
      status: string;
      final_reason: string | null;
      reject_reason: string | null;
      rejected_as_false: boolean;
      decided_by: string | null;
    };
  const activeReferences = async (): Promise<string[]> =>
    (
      await harness.pool.query<{ reference_key: string }>(
        'SELECT reference_key FROM payment_references WHERE group_id = $1 AND released_at IS NULL',
        [group.id],
      )
    ).rows.map((r) => r.reference_key);
  const reservedSlots = async (): Promise<number> =>
    (await get(group.ownerId, `/groups/${group.id}/join-requests`).expect(200)).body.slots.reserved;
  const upload = (id: string, reference: string): request.Test =>
    auth(http().post(`/join-requests/${id}/proof`), applicant)
      .field('method', 'qr')
      .field('reference', reference)
      .attach('file', jpegBytes(2048), { filename: 'c.jpg' });

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    harness.storage.files.clear();
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('POST /join-requests/:id/reject', () => {
    it.each<SeedState>(['abierta', 'esperando_pago', 'pago_informado'])(
      'CA-010-17: el titular rechaza una solicitud %s con motivo y el solicitante lo ve',
      async (state) => {
        const id = await seedRequest(harness, group, applicant, state);
        const rejected: JoinRequestRejected[] = [];
        harness.app
          .get(TxEventBus, { strict: false })
          .register<JoinRequestRejected>('join-requests.rejected', (_tx, event) => {
            if (event.requestId === id) rejected.push(event);
          });

        const response = await reject(group.ownerId, id, { reason: '  Ya no tengo cupo  ' }).expect(
          200,
        );

        expect(response.body).toMatchObject({
          phase: { status: 'rechazada' },
          rejectReason: 'Ya no tengo cupo',
          rejectedAsFalse: false,
          finalReason: 'rechazo_titular',
        });
        expect(await requestRow(id)).toMatchObject({
          status: 'rechazada',
          decided_by: group.ownerId,
          rejected_as_false: false,
        });
        const seen = await get(applicant, `/join-requests/${id}`).expect(200);
        expect(seen.body.rejectReason).toBe('Ya no tengo cupo');
        expect(seen.body.timeline.at(-1)).toMatchObject({
          type: 'rechazada',
          reason: 'Ya no tengo cupo',
          toStatus: 'rechazada',
        });
        expect(rejected).toEqual([
          expect.objectContaining({
            byHost: true,
            rejectedAsFalse: false,
            reason: 'Ya no tengo cupo',
          }),
        ]);
      },
    );

    it('CA-010-17: sin motivo, con menos de 5 o con más de 200 caracteres es un error de validación', async () => {
      const id = await seedRequest(harness, group, applicant, 'abierta');
      await reject(group.ownerId, id, {}).expect(400);
      await reject(group.ownerId, id, { reason: '    ' }).expect(400);
      const short = await reject(group.ownerId, id, { reason: 'no' }).expect(400);
      expect(short.body.code).toBe('VALIDATION_ERROR');
      await reject(group.ownerId, id, { reason: 'x'.repeat(201) }).expect(400);
      expect((await requestRow(id)).status).toBe('abierta');
      await reject(group.ownerId, id, { reason: 'x'.repeat(200) }).expect(200);
    });

    it('RF-010-16: rejectedAsFalse solo en pago_informado con comprobante; si no, 422 BUSINESS_RULE', async () => {
      const waiting = await seedRequest(harness, group, applicant, 'esperando_pago');
      const response = await reject(group.ownerId, waiting, {
        reason: 'No lo veo',
        markProofAsFalse: true,
      }).expect(422);
      expect(response.body).toMatchObject({
        code: 'BUSINESS_RULE',
        details: { rule: 'RF-010-16' },
      });
      expect((await requestRow(waiting)).status).toBe('esperando_pago');

      const other = await harness.insertUser();
      const informed = await seedRequest(harness, group, other, 'pago_informado');
      const marked = await reject(group.ownerId, informed, {
        reason: 'Comprobante falso',
        markProofAsFalse: true,
      }).expect(200);
      expect(marked.body.rejectedAsFalse).toBe(true);
      expect(await requestRow(informed)).toMatchObject({ rejected_as_false: true });
    });

    it('RF-010-16: libera el cupo reservado y la referencia del comprobante', async () => {
      const id = await seedRequest(harness, group, applicant, 'esperando_pago');
      await upload(id, 'REF-LIBRE-1').expect(200);
      expect(await activeReferences()).toEqual(['REF-LIBRE-1']);
      expect(await reservedSlots()).toBe(1);

      await reject(group.ownerId, id, { reason: 'No recibí el pago' }).expect(200);

      expect(await reservedSlots()).toBe(0);
      expect(await activeReferences()).toEqual([]);
      // La referencia liberada puede usarse otra vez en el grupo (CA-002-27).
      const again = await harness.insertUser();
      const next = await seedRequest(harness, group, again, 'esperando_pago');
      await auth(http().post(`/join-requests/${next}/proof`), again)
        .field('method', 'qr')
        .field('reference', 'REF-LIBRE-1')
        .attach('file', jpegBytes(2048), { filename: 'c.jpg' })
        .expect(200);
    });

    it('RF-010-16: solo el titular rechaza; un ajeno recibe 404; un estado final da 409; la versión vieja 409', async () => {
      const id = await seedRequest(harness, group, applicant, 'abierta');
      await reject(applicant, id, { reason: 'Me arrepentí' }).expect(403);
      await reject(await harness.insertUser(), id, { reason: 'No soy parte' }).expect(404);
      const stale = await reject(group.ownerId, id, {
        reason: 'Versión vieja',
        version: 99,
      }).expect(409);
      expect(stale.body.code).toBe('STALE_STATE');
      await reject(group.ownerId, id, { reason: 'Rechazo válido' }).expect(200);
      const final = await reject(group.ownerId, id, { reason: 'Otra vez' }).expect(409);
      expect(final.body.code).toBe('INVALID_TRANSITION');
    });

    it('RNF-010-03: una solicitud vencida pero no persistida no se puede rechazar y queda expirada', async () => {
      const id = await seedRequest(harness, group, applicant, 'abierta', { openMinutes: 10 });
      setClock(harness, new Date(Date.parse(NOW) + 11 * 60_000).toISOString());

      const response = await reject(group.ownerId, id, { reason: 'Llegué tarde' }).expect(409);

      expect(response.body.code).toBe('INVALID_TRANSITION');
      expect((await requestRow(id)).status).toBe('expirada');
    });
  });

  describe('POST /join-requests/:id/cancel', () => {
    it.each<SeedState>(['abierta', 'esperando_pago'])(
      'CA-010-18: el solicitante cancela una solicitud %s y se libera el cupo',
      async (state) => {
        const id = await seedRequest(harness, group, applicant, state);
        const cancelled: JoinRequestCancelled[] = [];
        harness.app
          .get(TxEventBus, { strict: false })
          .register<JoinRequestCancelled>('join-requests.cancelled', (_tx, event) => {
            if (event.requestId === id) cancelled.push(event);
          });

        const response = await cancel(applicant, id).expect(200);

        expect(response.body.phase.status).toBe('cancelada');
        expect(response.body.finalReason).toBe('cancelada_solicitante');
        expect(response.body.allowedActions).toEqual([]);
        expect(await requestRow(id)).toMatchObject({ status: 'cancelada' });
        expect(await reservedSlots()).toBe(0);
        expect(cancelled).toEqual([expect.objectContaining({ bySystem: false })]);
      },
    );

    it('CA-010-18: en pago_informado y en estados finales no puede cancelar (409)', async () => {
      const informed = await seedRequest(harness, group, applicant, 'pago_informado');
      const response = await cancel(applicant, informed).expect(409);
      expect(response.body.code).toBe('INVALID_TRANSITION');
      expect((await requestRow(informed)).status).toBe('pago_informado');

      const other = await harness.insertUser();
      const done = await seedRequest(harness, group, other, 'rechazada');
      await cancel(other, done).expect(409);
    });

    it('RF-010-15: solo el solicitante cancela; el titular recibe 403 y un ajeno 404', async () => {
      const id = await seedRequest(harness, group, applicant, 'abierta');
      await cancel(group.ownerId, id).expect(403);
      await cancel(await harness.insertUser(), id).expect(404);
      expect((await requestRow(id)).status).toBe('abierta');
    });
  });
});
