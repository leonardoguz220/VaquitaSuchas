import { jest } from '@jest/globals';
import request from 'supertest';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { OverdueService } from '../src/modules/billing/services/overdue.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import type {
  ChargeBecameOverdue,
  MemberRemovedForNonPayment,
} from '../src/shared/events/charge-events.js';
import type { MemberRemoved } from '../src/shared/events/group-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { uploadReceipt } from './support/receipt-files.js';

// Atrasos (spec 002, US8, T031/T032/T033) contra PostgreSQL real. NOW = 2026-10-16T15:00Z: un cobro
// con `dueAt` anterior a NOW está vencido y uno con `dueAt` posterior, no.
const OVERDUE = '2026-10-16T10:00:00.000Z';
const FUTURE = '2099-01-01T04:00:00.000Z';

describe('Atrasos y retiro por mora', () => {
  const harness = new BillingHarness();
  let overdue: OverdueService;
  let runner: JobRunner;
  let db: DbService;
  let group: TestGroup;
  let memberA: string;
  let memberB: string;
  const becameOverdue: ChargeBecameOverdue[] = [];
  const removedForMora: MemberRemovedForNonPayment[] = [];
  const removed: MemberRemoved[] = [];

  const state = async (
    chargeId: string,
  ): Promise<{ status: string; version: number; user_id: string }> =>
    (
      await harness.pool.query('SELECT status, version, user_id FROM charges WHERE id = $1', [
        chargeId,
      ])
    ).rows[0];

  const member = async (
    groupId: string,
    userId: string,
  ): Promise<{ left_at: Date | null; left_reason: string | null } | undefined> =>
    (
      await harness.pool.query(
        'SELECT left_at, left_reason FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, userId],
      )
    ).rows[0];

  const eventTypes = async (chargeId: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM charge_events WHERE charge_id = $1 ORDER BY type',
        [chargeId],
      )
    ).rows.map((r) => r.type);

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  const post = (userId: string, url: string, body: object = {}): request.Test =>
    request(harness.app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);

  const runJob = async (): Promise<number> => {
    const results = await runner.runAll('manual', { job: 'billing.overdue' });
    expect(results).toEqual([
      { job: 'billing.overdue', status: 'ok', processed: expect.any(Number) },
    ]);
    const first = results[0];
    return first?.status === 'ok' ? first.processed : -1;
  };

  beforeAll(async () => {
    await harness.start();
    overdue = harness.app.get(OverdueService, { strict: false });
    runner = harness.app.get(JobRunner, { strict: false });
    db = harness.app.get(DbService, { strict: false });
    const bus = harness.app.get(TxEventBus, { strict: false });
    bus.register<ChargeBecameOverdue>('billing.charge-became-overdue', (_tx, event) => {
      becameOverdue.push(event);
    });
    bus.register<MemberRemovedForNonPayment>(
      'billing.member-removed-for-non-payment',
      (_tx, event) => {
        removedForMora.push(event);
      },
    );
    bus.register<MemberRemoved>('groups.member-removed', (_tx, event) => {
      removed.push(event);
    });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  beforeEach(async () => {
    // Los grupos de pruebas anteriores no deben contar en los totales de la tarea.
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE status = 'activo'",
    );
    group = await harness.createGroup({ members: 2 });
    [memberA, memberB] = group.memberIds as [string, string];
    becameOverdue.length = 0;
    removedForMora.length = 0;
    removed.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-002-09: un cobro pendiente vencido pasa a atrasado y se anota el evento', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });

    await runJob();

    expect((await state(chargeId)).status).toBe('atrasado');
    expect(await eventTypes(chargeId)).toEqual(['atrasado', 'retiro_por_mora']);
    const event = await harness.pool.query(
      `SELECT actor_kind, actor_id, from_status, to_status FROM charge_events
        WHERE charge_id = $1 AND type = 'atrasado'`,
      [chargeId],
    );
    expect(event.rows[0]).toEqual({
      actor_kind: 'sistema',
      actor_id: null,
      from_status: 'pendiente',
      to_status: 'atrasado',
    });
    expect(becameOverdue).toEqual([
      {
        type: 'billing.charge-became-overdue',
        chargeId,
        groupId: group.id,
        userId: memberA,
      },
    ]);
  });

  it('CA-002-09 y RN-002-04: un cobro que aún no vence no se toca; vence en el instante exacto de dueAt', async () => {
    const early = await harness.insertCharge(group, memberA, { dueAt: FUTURE });
    const exact = await harness.insertCharge(group, memberB, { dueAt: NOW });

    await runJob();

    expect((await state(early)).status).toBe('pendiente');
    expect((await member(group.id, memberA))?.left_at).toBeNull();
    expect((await state(exact)).status).toBe('atrasado');
  });

  it('CA-002-10: un cobro en revisión vencido permanece en revisión', async () => {
    const chargeId = await harness.insertCharge(group, memberA, {
      dueAt: OVERDUE,
      status: 'en_revision',
    });

    await runJob();

    expect((await state(chargeId)).status).toBe('en_revision');
    expect(await eventTypes(chargeId)).toEqual([]);
    expect(becameOverdue).toEqual([]);
  });

  it('CA-002-29: un cobro en revisión al vencer no retira al miembro', async () => {
    await harness.insertCharge(group, memberA, { dueAt: OVERDUE, status: 'en_revision' });

    await runJob();

    expect((await member(group.id, memberA))?.left_at).toBeNull();
    expect(removedForMora).toEqual([]);
  });

  it('CA-002-28 y CA-001-29: el atraso retira al miembro por mora, publica los avisos y los demás siguen', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    const other = await harness.insertCharge(group, memberB, { dueAt: FUTURE });

    await runJob();

    const left = await member(group.id, memberA);
    expect(left?.left_at).not.toBeNull();
    expect(left?.left_reason).toBe('mora');
    expect((await member(group.id, memberB))?.left_at).toBeNull();
    expect((await member(group.id, group.ownerId))?.left_at).toBeNull();
    expect((await state(other)).status).toBe('pendiente');
    expect(await eventTypes(chargeId)).toEqual(['atrasado', 'retiro_por_mora']);
    // Titular y miembro reciben el aviso: la spec 005 se engancha a estos eventos (T041).
    expect(removedForMora).toEqual([
      {
        type: 'billing.member-removed-for-non-payment',
        groupId: group.id,
        userId: memberA,
        chargeId,
      },
    ]);
    expect(removed).toEqual([
      { type: 'groups.member-removed', groupId: group.id, userId: memberA, reason: 'mora' },
    ]);
  });

  it('CA-001-29: tras el retiro, el siguiente ciclo se calcula con los miembros restantes', async () => {
    await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    await runJob();

    jest.spyOn(harness.clock, 'now').mockReturnValue(new Date('2026-11-16T15:00:00.000Z'));
    const cycles = harness.app.get(BillingCyclesService, { strict: false });
    const generated = await db.withTransaction((tx) =>
      cycles.ensureCurrentCycle(tx, group.id, harness.clock.now()),
    );

    expect(generated).toMatchObject({ period: '2026-11', chargeCount: 1 });
    const cycle = await harness.pool.query(
      `SELECT member_count, base_share_cents::int AS base, owner_share_cents::int AS owner,
              total_bs_cents::int AS total FROM billing_cycles WHERE group_id = $1 AND period = '2026-11'`,
      [group.id],
    );
    expect(cycle.rows[0].member_count).toBe(2);
    expect(cycle.rows[0].base + cycle.rows[0].owner).toBe(cycle.rows[0].total);
  });

  it('CA-002-28: varios cobros vencidos de la misma persona la retiran una sola vez', async () => {
    const first = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    const second = await harness.insertCharge(group, memberA, {
      period: '2026-09',
      dueAt: '2026-09-19T04:00:00.000Z',
    });

    await runJob();

    expect((await state(first)).status).toBe('atrasado');
    expect((await state(second)).status).toBe('atrasado');
    expect(removed).toHaveLength(1);
    expect(removedForMora).toHaveLength(1);
    expect(becameOverdue).toHaveLength(2);
  });

  it('RF-002-14: quien ya no es miembro igual deja su cobro atrasado, sin otro retiro', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    await harness.leaveGroup(group.id, memberA, 'quitado');

    await runJob();

    expect((await state(chargeId)).status).toBe('atrasado');
    expect(await eventTypes(chargeId)).toEqual(['atrasado']);
    expect((await member(group.id, memberA))?.left_reason).toBe('quitado');
    expect(removedForMora).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('CA-002-09: el barrido es idempotente, la segunda pasada no cambia nada', async () => {
    await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    expect(await runJob()).toBeGreaterThan(0);

    expect(await runJob()).toBe(0);
    expect(becameOverdue).toHaveLength(1);
  });

  it('RF-002-14: si otra ejecución tiene el bloqueo del grupo, el barrido lo omite sin esperar', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
    const holder = await harness.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `billing.overdue:${group.id}`,
      ]);

      await overdue.sweepGroup(group.id, harness.clock.now());
      expect((await state(chargeId)).status).toBe('pendiente');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    await overdue.sweepGroup(group.id, harness.clock.now());
    expect((await state(chargeId)).status).toBe('atrasado');
  });

  describe('sweepGroup al actuar o leer (research R2)', () => {
    it('CA-002-09: consultar el historial del grupo marca primero los atrasos aunque la tarea no haya corrido', async () => {
      const chargeId = await harness.insertCharge(group, memberB, { dueAt: OVERDUE });

      const response = await get(group.ownerId, `/groups/${group.id}/charges`).expect(200);

      expect(response.body.items[0]).toMatchObject({ id: chargeId, status: 'atrasado' });
      expect((await member(group.id, memberB))?.left_reason).toBe('mora');
    });

    it('CA-002-09: el resumen del mes y GET /charges/:id también barren el grupo', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });

      const detail = await get(group.ownerId, `/charges/${chargeId}`).expect(200);

      expect(detail.body.status).toBe('atrasado');
      const other = await harness.insertCharge(group, memberB, {
        period: '2026-09',
        dueAt: '2026-09-19T04:00:00.000Z',
      });
      const summary = await get(group.ownerId, `/groups/${group.id}/billing/summary`).expect(200);
      expect(summary.body.period).toBe('2026-10');
      expect((await state(other)).status).toBe('atrasado');
    });

    it('CA-002-09: GET /me/charges barre los grupos con cobros vencidos de la persona', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });

      const response = await get(memberA, '/me/charges').expect(200);

      expect(response.body.items.map((i: { id: string }) => i.id)).toContain(chargeId);
      expect((await state(chargeId)).status).toBe('atrasado');
    });

    it('CA-002-28: el titular que confirma un cobro encuentra antes el atraso de otro cobro vencido', async () => {
      const submitted = await harness.insertCharge(group, memberA, {
        dueAt: '2099-01-01T04:00:00.000Z',
      });
      await uploadReceipt(harness, memberA, submitted, { reference: 'TX-1' }).expect(201);
      const late = await harness.insertCharge(group, memberB, { dueAt: OVERDUE });

      await post(group.ownerId, `/charges/${submitted}/confirm`).expect(200);

      expect((await state(late)).status).toBe('atrasado');
      expect((await member(group.id, memberB))?.left_reason).toBe('mora');
    });

    it('CA-002-30: rechazar un comprobante de un cobro vencido lo deja atrasado y no retira a nadie más', async () => {
      const chargeId = await harness.insertCharge(group, memberA, {
        dueAt: OVERDUE,
        status: 'en_revision',
      });
      await harness.insertReceipt(chargeId, memberA);

      await post(group.ownerId, `/charges/${chargeId}/reject`, {
        reason: 'Monto incorrecto',
        invalidReceipt: false,
      }).expect(200);

      expect((await state(chargeId)).status).toBe('atrasado');
      expect((await member(group.id, memberA))?.left_at).toBeNull();
    });

    it('RN-002-11: quien sube el comprobante tras el vencimiento ya está atrasado y retirado, y igual puede pagar', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });

      await uploadReceipt(harness, memberA, chargeId, { reference: 'TX-LATE' }).expect(201);

      expect((await state(chargeId)).status).toBe('en_revision');
      expect((await member(group.id, memberA))?.left_reason).toBe('mora');
      expect(await eventTypes(chargeId)).toEqual([
        'atrasado',
        'comprobante_subido',
        'retiro_por_mora',
      ]);
    });
  });

  describe('grupos cerrados y congelados (research R5, T033)', () => {
    it('RF-002-05: un grupo cerrado no marca atrasos ni retira a nadie', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
      await harness.pool.query(
        `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
        [group.id],
      );

      await runJob();
      await overdue.sweepGroup(group.id, harness.clock.now());

      expect((await state(chargeId)).status).toBe('pendiente');
      expect((await member(group.id, memberA))?.left_at).toBeNull();
      expect(removedForMora).toEqual([]);
    });

    it('RF-002-05: un grupo congelado queda quieto, también al leerlo', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: OVERDUE });
      await harness.freezeGroup(group.id);

      await runJob();
      await get(group.ownerId, `/groups/${group.id}/charges`).expect(200);

      expect((await state(chargeId)).status).toBe('pendiente');
      expect((await member(group.id, memberA))?.left_at).toBeNull();
    });

    it('R5: en un grupo cerrado los cobros existentes se pueden seguir saldando', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { dueAt: FUTURE });
      await uploadReceipt(harness, memberA, chargeId, { reference: 'TX-CERRADO' }).expect(201);
      await harness.pool.query(
        `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
        [group.id],
      );

      const response = await post(group.ownerId, `/charges/${chargeId}/confirm`).expect(200);

      expect(response.body.status).toBe('pagado');
    });

    it('R5 y RF-002-14: un cobro vencido de un grupo cerrado no se marca ni al confirmar otro', async () => {
      const submitted = await harness.insertCharge(group, memberA, { dueAt: FUTURE });
      await uploadReceipt(harness, memberA, submitted, { reference: 'TX-2' }).expect(201);
      const late = await harness.insertCharge(group, memberB, { dueAt: OVERDUE });
      await harness.pool.query(
        `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
        [group.id],
      );

      await post(group.ownerId, `/charges/${submitted}/confirm`).expect(200);

      expect((await state(late)).status).toBe('pendiente');
      expect((await member(group.id, memberB))?.left_at).toBeNull();
    });
  });

  describe('gracia por emisión tardía (research R1, T033)', () => {
    it('RF-002-03 y CA-002-22: un cobro emitido tarde no se marca atrasado hasta cumplir sus 3 días', async () => {
      // Corte del 15; el servidor vuelve el 21: due_at = emisión + 72 h, no el 19 a las 00:00.
      const issuedAt = new Date('2026-10-21T15:00:00.000Z');
      jest.spyOn(harness.clock, 'now').mockReturnValue(issuedAt);
      const cycles = harness.app.get(BillingCyclesService, { strict: false });
      await harness.pool.query(
        `DELETE FROM billing_cycles WHERE group_id = $1 AND period = '2026-10'`,
        // El ciclo de prueba del harness (sin cobros) se quita para generar el de verdad.
        [group.id],
      );
      const generated = await db.withTransaction((tx) =>
        cycles.ensureCurrentCycle(tx, group.id, issuedAt),
      );
      expect(generated).toMatchObject({ period: '2026-10', chargeCount: 2 });
      const dueAt = new Date(issuedAt.getTime() + 72 * 3600 * 1000);

      jest.spyOn(harness.clock, 'now').mockReturnValue(new Date(dueAt.getTime() - 1000));
      await runJob();
      expect(
        (
          await harness.pool.query(
            `SELECT count(*)::int AS n FROM charges WHERE group_id = $1 AND status = 'atrasado'`,
            [group.id],
          )
        ).rows[0].n,
      ).toBe(0);

      jest.spyOn(harness.clock, 'now').mockReturnValue(dueAt);
      await runJob();
      expect(
        (
          await harness.pool.query(
            `SELECT count(*)::int AS n FROM charges WHERE group_id = $1 AND status = 'atrasado'`,
            [group.id],
          )
        ).rows[0].n,
      ).toBe(2);
      expect(removedForMora).toHaveLength(2);
    });
  });
});
