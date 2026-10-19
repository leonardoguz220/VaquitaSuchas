import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import type {
  JoinRequestAccepted,
  JoinRequestCancelled,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { ChargesService } from '../src/modules/billing/services/charges.service.js';
import { MembershipService } from '../src/modules/subscriptions/services/membership.service.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { RequestsRepository } from '../src/modules/join-requests/repositories/requests.repository.js';
import { GroupsService } from '../src/modules/subscriptions/services/groups.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { insertOwnedGroup } from './support/groups-fixtures.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

const PROOF_KEY = 'proofs/test.png';

// Aceptación de solicitudes (spec 010 US4, T028/T029): confirmar, efectivo y la secuencia
// atómica de research R2, contra PostgreSQL real con el almacén en memoria.
describe('Aceptación de solicitudes de ingreso', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  let group: TestGroup;
  let applicant: string;
  let requestId: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const post = (userId: string, url: string, body: object = {}): request.Test =>
    auth(http().post(url), userId).send(body);
  const confirm = (userId: string, id = requestId, body: object = {}): request.Test =>
    post(userId, `/join-requests/${id}/confirm`, body);
  const cash = (userId: string, id = requestId, body: object = {}): request.Test =>
    post(userId, `/join-requests/${id}/cash-payment`, body);

  const requestRow = async (id: string) =>
    (
      await harness.pool.query(
        `SELECT status, version, final_reason, accepted_method, charge_id, decided_by
           FROM join_requests WHERE id = $1`,
        [id],
      )
    ).rows[0] as {
      status: string;
      version: number;
      final_reason: string | null;
      accepted_method: string | null;
      charge_id: string | null;
      decided_by: string | null;
    };
  const eventTypes = async (id: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at',
        [id],
      )
    ).rows.map((r) => r.type);
  const count = async (sql: string, params: unknown[]): Promise<number> =>
    Number((await harness.pool.query<{ n: string }>(sql, params)).rows[0]?.n);
  const membersOf = (userId: string): Promise<number> =>
    count(
      'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL',
      [group.id, userId],
    );
  const chargesOf = (userId: string): Promise<number> =>
    count('SELECT count(*)::text AS n FROM charges WHERE group_id = $1 AND user_id = $2', [
      group.id,
      userId,
    ]);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 }); // titular + 1 = 2 miembros, 5 cupos
    applicant = await harness.insertUser();
    requestId = await seedRequest(harness, group, applicant, 'pago_informado');
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
    harness.storage.files.set(PROOF_KEY, {
      body: new Uint8Array([0x89, 0x50]),
      contentType: 'image/png',
    });
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('POST /join-requests/:id/confirm', () => {
    it('CA-010-11 y RN-010-03: pasa a aceptada, la persona es miembro y su cobro de ingreso nace pagado con la cuota cotizada', async () => {
      const accepted: JoinRequestAccepted[] = [];
      harness.app
        .get(TxEventBus, { strict: false })
        .register<JoinRequestAccepted>('join-requests.accepted', (_tx, event) => {
          if (event.requestId === requestId) accepted.push(event);
        });

      const response = await confirm(group.ownerId).expect(200);

      expect(response.body.phase.status).toBe('aceptada');
      expect(response.body.acceptedMethod).toBe('comprobante');
      expect(response.body.chargeId).toEqual(expect.any(String));
      expect(response.body.allowedActions).not.toContain('confirm');
      const member = await harness.pool.query(
        `SELECT role, join_source, join_request_id FROM group_members
          WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [group.id, applicant],
      );
      expect(member.rows).toEqual([
        { role: 'miembro', join_source: 'solicitud', join_request_id: requestId },
      ]);
      const charge = await harness.pool.query(
        `SELECT id, status, origin, settlement, period, amount_cents::text, price_cents::text,
                currency, member_count, join_request_id, settled_by
           FROM charges WHERE group_id = $1 AND user_id = $2`,
        [group.id, applicant],
      );
      expect(charge.rows).toEqual([
        {
          id: response.body.chargeId,
          status: 'pagado',
          origin: 'ingreso',
          settlement: 'ingreso',
          period: '2026-10',
          amount_cents: '3333',
          price_cents: '10001',
          currency: 'BS',
          member_count: 3,
          join_request_id: requestId,
          settled_by: group.ownerId,
        },
      ]);
      // El comprobante pasa a ser el del cobro, con su propia copia del archivo.
      const receipt = await harness.pool.query<{
        file_key: string;
        reference: string;
        status: string;
      }>('SELECT file_key, reference, status FROM receipts WHERE charge_id = $1', [
        response.body.chargeId,
      ]);
      expect(receipt.rows).toEqual([
        expect.objectContaining({ reference: 'REF-1', status: 'confirmado' }),
      ]);
      const copied = receipt.rows[0]?.file_key as string;
      expect(copied).not.toBe(PROOF_KEY);
      expect(harness.storage.files.has(copied)).toBe(true);
      expect(await requestRow(requestId)).toMatchObject({
        status: 'aceptada',
        final_reason: 'confirmada',
        accepted_method: 'comprobante',
        decided_by: group.ownerId,
      });
      expect(await eventTypes(requestId)).toEqual(['abierta', 'confirmada']);
      expect(accepted).toEqual([
        expect.objectContaining({
          chargeId: response.body.chargeId,
          method: 'comprobante',
          listingId: null,
          applicantId: applicant,
          hostId: group.ownerId,
        }),
      ]);
    });

    it('CA-010-12: la generación del mismo período no crea un segundo cobro y en el siguiente corte llega el regular', async () => {
      // El período aún no tiene ciclo: se crea con ensureCurrentCycle ANTES del alta (R2).
      await harness.pool.query('DELETE FROM billing_cycles WHERE group_id = $1', [group.id]);

      const response = await confirm(group.ownerId).expect(200);

      expect(
        await count(
          `SELECT count(*)::text AS n FROM billing_cycles WHERE group_id = $1 AND period = '2026-10'`,
          [group.id],
        ),
      ).toBe(1);
      expect(await chargesOf(applicant)).toBe(1);
      const runner = harness.app.get(JobRunner, { strict: false });
      await runner.runAll('manual', { job: 'billing.generate' });
      expect(await chargesOf(applicant)).toBe(1);
      const entry = await harness.pool.query<{ id: string; status: string }>(
        'SELECT id, status FROM charges WHERE group_id = $1 AND user_id = $2',
        [group.id, applicant],
      );
      expect(entry.rows).toEqual([{ id: response.body.chargeId, status: 'pagado' }]);

      setClock(harness, '2026-11-16T15:00:00.000Z');
      await runner.runAll('manual', { job: 'billing.generate' });
      const next = await harness.pool.query<{ period: string; origin: string }>(
        'SELECT period, origin FROM charges WHERE group_id = $1 AND user_id = $2 ORDER BY period',
        [group.id, applicant],
      );
      expect(next.rows.map((r) => r.period)).toEqual(['2026-10', '2026-11']);
      expect(next.rows[1]?.origin).not.toBe('ingreso');
    });

    it('CA-010-13: el titular y el nuevo miembro se ven el celular mutuamente', async () => {
      await confirm(group.ownerId).expect(200);
      const hostPhone = (
        await harness.pool.query<{ phone_e164: string }>(
          'SELECT phone_e164 FROM users WHERE id = $1',
          [group.ownerId],
        )
      ).rows[0]?.phone_e164;
      const applicantPhone = (
        await harness.pool.query<{ phone_e164: string }>(
          'SELECT phone_e164 FROM users WHERE id = $1',
          [applicant],
        )
      ).rows[0]?.phone_e164;

      // `GET /groups/:id` es de la spec 001 (T019, pendiente): se consulta su servicio de detalle.
      const groups = harness.app.get(GroupsService, { strict: false });
      const db = harness.app.get(DbService, { strict: false });
      const asHost = await db.withTransaction((tx) => groups.detail(tx, group.id, group.ownerId));
      const asApplicant = await db.withTransaction((tx) => groups.detail(tx, group.id, applicant));

      const phoneIn = (
        detail: { members: { userId: string; phone: string | null }[] },
        id: string,
      ) => detail.members.find((m) => m.userId === id)?.phone;
      expect(phoneIn(asHost, applicant)).toBe(applicantPhone);
      expect(phoneIn(asApplicant, group.ownerId)).toBe(hostPhone);
      expect(hostPhone).toBeTruthy();
    });

    it('RF-010-17: solo el titular confirma, solo desde pago_informado, con versión vigente y grupo no congelado', async () => {
      await confirm(applicant).expect(403);
      await confirm(await harness.insertUser()).expect(404);
      const stale = await confirm(group.ownerId, requestId, { version: 99 }).expect(409);
      expect(stale.body.code).toBe('STALE_STATE');

      const waiting = await seedRequest(
        harness,
        group,
        await harness.insertUser(),
        'esperando_pago',
      );
      await harness.freezeGroup(group.id);
      const frozen = await confirm(group.ownerId).expect(422);
      expect(frozen.body.code).toBe('GROUP_FROZEN');
      expect((await requestRow(requestId)).status).toBe('pago_informado');
      expect(await membersOf(applicant)).toBe(0);

      await harness.pool.query(
        'UPDATE groups SET frozen_at = NULL, frozen_reason = NULL WHERE id = $1',
        [group.id],
      );
      const invalid = await confirm(group.ownerId, waiting).expect(409);
      expect(invalid.body.code).toBe('INVALID_TRANSITION');
    });

    it('RF-010-17 y RNF-010-03: tras 60 minutos sin decisión ya expiró y confirmar da 409 (queda expirada)', async () => {
      await harness.pool.query(`UPDATE join_requests SET decision_deadline_at = $2 WHERE id = $1`, [
        requestId,
        new Date(Date.parse(NOW) + 60 * 60_000),
      ]);
      setClock(harness, new Date(Date.parse(NOW) + 61 * 60_000).toISOString());

      const response = await confirm(group.ownerId).expect(409);

      expect(response.body.code).toBe('INVALID_TRANSITION');
      expect(await requestRow(requestId)).toMatchObject({ status: 'expirada' });
      expect(await membersOf(applicant)).toBe(0);
      expect(await chargesOf(applicant)).toBe(0);
    });

    it('RF-010-20: con un solo cupo libre y dos confirmaciones simultáneas entra una sola persona', async () => {
      await harness.pool.query('UPDATE groups SET total_slots = 3 WHERE id = $1', [group.id]);
      const other = await harness.insertUser();
      const otherRequest = await seedRequest(harness, group, other, 'pago_informado');

      const results = await Promise.all([
        confirm(group.ownerId, requestId),
        confirm(group.ownerId, otherRequest),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(results.find((r) => r.status === 422)?.body.code).toBe('BUSINESS_RULE');
      expect(
        await count(
          'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
          [group.id],
        ),
      ).toBe(3);
      const statuses = [
        (await requestRow(requestId)).status,
        (await requestRow(otherRequest)).status,
      ];
      expect(statuses.sort()).toEqual(['aceptada', 'pago_informado']);
    });
  });

  describe('POST /join-requests/:id/cash-payment', () => {
    beforeEach(async () => {
      // La solicitud de pago_informado del beforeEach externo se cancela para liberar el índice único.
      await harness.pool.query(
        `UPDATE join_requests SET status = 'cancelada', final_at = now(),
                final_reason = 'cancelada_solicitante' WHERE id = $1`,
        [requestId],
      );
      requestId = await seedRequest(harness, group, applicant, 'esperando_pago');
    });

    it('CA-010-16 y RF-010-18: desde esperando_pago pasa a aceptada con método efectivo y el mismo efecto que confirmar', async () => {
      const response = await cash(group.ownerId).expect(200);

      expect(response.body.phase.status).toBe('aceptada');
      expect(response.body.acceptedMethod).toBe('efectivo');
      expect(response.body.finalReason).toBe('efectivo');
      expect(await membersOf(applicant)).toBe(1);
      const charge = await harness.pool.query(
        `SELECT status, origin, amount_cents::text FROM charges WHERE id = $1`,
        [response.body.chargeId],
      );
      expect(charge.rows).toEqual([{ status: 'pagado', origin: 'ingreso', amount_cents: '3333' }]);
      expect(
        await count('SELECT count(*)::text AS n FROM receipts WHERE charge_id = $1', [
          response.body.chargeId,
        ]),
      ).toBe(0);
      expect(await eventTypes(requestId)).toEqual(['abierta', 'efectivo_registrado']);
    });

    it('RF-010-18: efectivo solo desde esperando_pago y solo el titular; confirmar desde esperando_pago es inválido', async () => {
      await cash(applicant).expect(403);
      const confirmWaiting = await confirm(group.ownerId).expect(409);
      expect(confirmWaiting.body.code).toBe('INVALID_TRANSITION');
      const informed = await seedRequest(
        harness,
        group,
        await harness.insertUser(),
        'pago_informado',
      );
      const response = await cash(group.ownerId, informed).expect(409);
      expect(response.body.code).toBe('INVALID_TRANSITION');
      const open = await seedRequest(harness, group, await harness.insertUser(), 'abierta');
      await cash(group.ownerId, open).expect(409);
    });
  });

  describe('CA-010-47: se cancelan las abiertas del mismo servicio', () => {
    let planSeq = 0;
    let serviceId: string;
    let otherServiceId: string;
    const planOf = async (slug: string, service: string): Promise<string> =>
      (
        await harness.pool.query<{ id: string }>(
          `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots)
           VALUES ($1, $2, 'Plan', 10001, 'BS', 5) RETURNING id`,
          [service, slug],
        )
      ).rows[0]?.id as string;
    const service = async (slug: string, name: string): Promise<string> =>
      (
        await harness.pool.query<{ id: string }>(
          `INSERT INTO catalog_services (slug, name, category) VALUES ($1, $2, 'video') RETURNING id`,
          [slug, name],
        )
      ).rows[0]?.id as string;
    /** La copia del catálogo es inmutable para el servicio; la prueba la fija con el disparador apagado. */
    async function linkToPlan(groupId: string, planId: string | null): Promise<void> {
      await harness.pool.query('ALTER TABLE groups DISABLE TRIGGER groups_immutable_snapshots');
      try {
        await harness.pool.query(
          'UPDATE groups SET catalog_plan_id = $2, plan_name_snapshot = $3 WHERE id = $1',
          [groupId, planId, planId === null ? null : 'Plan'],
        );
      } finally {
        await harness.pool.query('ALTER TABLE groups ENABLE TRIGGER groups_immutable_snapshots');
      }
    }

    beforeEach(async () => {
      const tag = `t${(planSeq += 1)}`;
      serviceId = await service(`svc-${tag}`, `Servicio ${tag}`);
      otherServiceId = await service(`otr-${tag}`, `Otro ${tag}`);
      await linkToPlan(group.id, await planOf(`plan-a-${tag}`, serviceId));
    });

    it('CA-010-47 y R2: aceptada en un grupo del servicio X, sus solicitudes abiertas a otros grupos de X pasan a cancelada por el sistema', async () => {
      const sameOwner = await harness.insertUser();
      const sameGroup = await insertOwnedGroup(harness, sameOwner);
      await linkToPlan(sameGroup, await planOf(`plan-b-${(planSeq += 1)}`, serviceId));
      const diffGroup = await insertOwnedGroup(harness, await harness.insertUser());
      await linkToPlan(diffGroup, await planOf(`plan-c-${(planSeq += 1)}`, otherServiceId));
      const customGroup = await insertOwnedGroup(harness, await harness.insertUser());
      const sameOpen = await seedRequest(harness, { id: sameGroup }, applicant, 'abierta');
      const sameWaiting = await seedRequest(
        harness,
        { id: await insertLinked(serviceId) },
        applicant,
        'esperando_pago',
      );
      const diffOpen = await seedRequest(harness, { id: diffGroup }, applicant, 'abierta');
      const customOpen = await seedRequest(harness, { id: customGroup }, applicant, 'abierta');
      const cancelled: JoinRequestCancelled[] = [];
      harness.app
        .get(TxEventBus, { strict: false })
        .register<JoinRequestCancelled>('join-requests.cancelled', (_tx, event) => {
          cancelled.push(event);
        });

      await confirm(group.ownerId).expect(200);

      expect(await requestRow(sameOpen)).toMatchObject({
        status: 'cancelada',
        final_reason: 'aceptado_en_otro_grupo',
      });
      expect((await requestRow(sameWaiting)).status).toBe('esperando_pago');
      expect((await requestRow(diffOpen)).status).toBe('abierta');
      expect((await requestRow(customOpen)).status).toBe('abierta');
      const timeline = await harness.pool.query(
        `SELECT type, actor_id, reason FROM join_request_events
          WHERE request_id = $1 AND type = 'cancelada'`,
        [sameOpen],
      );
      expect(timeline.rows).toEqual([
        { type: 'cancelada', actor_id: null, reason: 'aceptado_en_otro_grupo' },
      ]);
      expect(cancelled).toEqual([
        expect.objectContaining({ requestId: sameOpen, bySystem: true, hostId: sameOwner }),
      ]);
    });

    it('R2: un grupo con servicio personalizado no tiene servicio común y no cancela nada', async () => {
      const custom = await harness.createGroup({ members: 1 });
      const customApplicant = await harness.insertUser();
      const customRequest = await seedRequest(harness, custom, customApplicant, 'pago_informado');
      const otherGroup = await insertOwnedGroup(harness, await harness.insertUser());
      await linkToPlan(otherGroup, await planOf(`plan-d-${(planSeq += 1)}`, serviceId));
      const open = await seedRequest(harness, { id: otherGroup }, customApplicant, 'abierta');

      await confirm(custom.ownerId, customRequest).expect(200);

      expect((await requestRow(open)).status).toBe('abierta');
    });

    async function insertLinked(forService: string): Promise<string> {
      const id = await insertOwnedGroup(harness, await harness.insertUser());
      await linkToPlan(id, await planOf(`plan-e-${(planSeq += 1)}`, forService));
      return id;
    }
  });

  describe('Todo o nada (research R2)', () => {
    /** Fotografía de todo lo que la aceptación toca. */
    async function snapshot() {
      return {
        request: await requestRow(requestId),
        events: await eventTypes(requestId),
        members: await membersOf(applicant),
        charges: await chargesOf(applicant),
        receipts: await count(
          'SELECT count(*)::text AS n FROM receipts r JOIN charges c ON c.id = r.charge_id WHERE c.group_id = $1',
          [group.id],
        ),
        cycles: await count('SELECT count(*)::text AS n FROM billing_cycles WHERE group_id = $1', [
          group.id,
        ]),
        files: [...harness.storage.files.keys()].sort(),
      };
    }
    const boom = (): Error => new Error('falla simulada');

    const steps: [string, () => jest.SpiedFunction<(...args: never[]) => Promise<unknown>>][] = [
      [
        'ensureCurrentCycle',
        () =>
          jest
            .spyOn(harness.app.get(BillingCyclesService, { strict: false }), 'ensureCurrentCycle')
            .mockRejectedValue(boom()) as never,
      ],
      [
        'addMemberTx',
        () =>
          jest
            .spyOn(harness.app.get(MembershipService, { strict: false }), 'addMemberTx')
            .mockRejectedValue(boom()) as never,
      ],
      [
        'createEntryCharge',
        () =>
          jest
            .spyOn(harness.app.get(ChargesService, { strict: false }), 'createEntryCharge')
            .mockRejectedValue(boom()) as never,
      ],
      [
        'recordAcceptance',
        () =>
          jest
            .spyOn(harness.app.get(RequestsRepository, { strict: false }), 'recordAcceptance')
            .mockRejectedValue(boom()) as never,
      ],
      [
        'JoinRequestAccepted',
        () => {
          const bus = harness.app.get(TxEventBus, { strict: false });
          const original = bus.publish.bind(bus);
          return jest
            .spyOn(bus, 'publish')
            .mockImplementation((tx, event) =>
              event.type === 'join-requests.accepted'
                ? Promise.reject(boom())
                : original(tx, event),
            ) as never;
        },
      ],
      [
        'cancelar las abiertas del mismo servicio',
        () =>
          jest
            .spyOn(
              harness.app.get(RequestsRepository, { strict: false }),
              'listOpenInSameServiceForUpdate',
            )
            .mockRejectedValue(boom()) as never,
      ],
    ];

    it.each(steps)(
      'RN-010-03 y R2: si falla %s no queda nada a medias (ni miembro, ni cobro, ni archivo) y reintentar funciona',
      async (_step, inject) => {
        await harness.pool.query('DELETE FROM billing_cycles WHERE group_id = $1', [group.id]);
        const before = await snapshot();
        const spy = inject();

        const failed = await confirm(group.ownerId).expect(500);

        expect(failed.body.code).toBe('INTERNAL_ERROR');
        expect(JSON.stringify(failed.body)).not.toContain('falla simulada');
        expect(await snapshot()).toEqual(before);

        spy.mockRestore();
        await confirm(group.ownerId).expect(200);
        expect((await requestRow(requestId)).status).toBe('aceptada');
        expect(await membersOf(applicant)).toBe(1);
        expect(await chargesOf(applicant)).toBe(1);
      },
    );

    it('RN-010-03: el efectivo también es todo o nada', async () => {
      requestId = await seedRequest(harness, group, await harness.insertUser(), 'esperando_pago');
      const buyer = (
        await harness.pool.query<{ applicant_id: string }>(
          'SELECT applicant_id FROM join_requests WHERE id = $1',
          [requestId],
        )
      ).rows[0]?.applicant_id as string;
      jest
        .spyOn(harness.app.get(ChargesService, { strict: false }), 'createEntryCharge')
        .mockRejectedValue(boom());

      await cash(group.ownerId).expect(500);

      expect((await requestRow(requestId)).status).toBe('esperando_pago');
      expect(await membersOf(buyer)).toBe(0);
    });
  });
});
