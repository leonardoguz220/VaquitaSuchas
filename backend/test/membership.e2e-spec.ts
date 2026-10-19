import request from 'supertest';
import { DomainError } from '../src/shared/errors/domain-error.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { MemberRemoved } from '../src/shared/events/group-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { OpenChargesAdapter } from '../src/app-adapters/open-charges.adapter.js';
import { MembershipService } from '../src/modules/subscriptions/services/membership.service.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Membresías (spec 001 T026/T027): alta transaccional, baja por el titular y recálculo de cuotas.
// Los grupos se crean por POST /groups (ciclo inicial abierto) con un puerto de elegibilidad de prueba.
describe('Membresías', () => {
  const harness = new BillingHarness({
    configure: (builder) =>
      builder.overrideProvider(HOST_ELIGIBILITY_PORT).useValue({
        check: () =>
          Promise.resolve({
            eligible: true,
            source: 'manual',
            requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
            current: { stars: null, consideredCharges: 0, level: null },
          }),
      }),
  });
  let membership: MembershipService;
  let db: DbService;
  const removedEvents: MemberRemoved[] = [];

  const asUser = (userId: string, method: 'post' | 'delete', url: string): request.Test =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  async function createGroup(totalSlots: number): Promise<TestGroup> {
    const ownerId = await harness.insertUser('Titular');
    const response = await asUser(ownerId, 'post', '/groups')
      .send({
        customServiceName: 'Mi servicio',
        name: 'Grupo de prueba',
        priceCents: 10001,
        currency: 'BS',
        billingDay: 15,
        totalSlots,
      })
      .expect(201);
    const cycle = await harness.pool.query<{ id: string }>(
      'SELECT id FROM billing_cycles WHERE group_id = $1',
      [response.body.id],
    );
    return {
      id: response.body.id as string,
      ownerId,
      memberIds: [],
      cycleId: cycle.rows[0]?.id as string,
    };
  }

  const addMember = (group: TestGroup, userId: string): Promise<unknown> =>
    db.withTransaction((tx) => membership.addMemberTx(tx, group.id, userId, 'creacion', null));

  async function join(group: TestGroup): Promise<string> {
    const userId = await harness.insertUser();
    await addMember(group, userId);
    group.memberIds.push(userId);
    return userId;
  }

  const activeCount = async (groupId: string): Promise<number> =>
    Number(
      (
        await harness.pool.query(
          'SELECT count(*) AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
          [groupId],
        )
      ).rows[0].n,
    );

  const initialCycle = async (
    groupId: string,
  ): Promise<{ member_count: number; base: string; owner: string; total: string }> =>
    (
      await harness.pool.query(
        `SELECT member_count, base_share_cents::text AS base, owner_share_cents::text AS owner,
                total_bs_cents::text AS total
           FROM billing_cycles WHERE group_id = $1 AND cycle_type = 'inicial'`,
        [groupId],
      )
    ).rows[0];

  async function failure(promise: Promise<unknown>): Promise<DomainError> {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }

  beforeAll(async () => {
    await harness.start();
    membership = harness.app.get(MembershipService, { strict: false });
    db = harness.app.get(DbService, { strict: false });
    harness.app
      .get(TxEventBus, { strict: false })
      .register<MemberRemoved>('groups.member-removed', (_tx, event) => {
        removedEvents.push(event);
      });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  describe('addMemberTx', () => {
    it('RF-001-15 y CA-001-12: agrega al miembro y recalcula el ciclo inicial (la suma cuadra)', async () => {
      const group = await createGroup(3);
      expect((await initialCycle(group.id)).member_count).toBe(1);

      await join(group);
      await join(group);

      const cycle = await initialCycle(group.id);
      expect(cycle.member_count).toBe(3);
      expect(Number(cycle.base) * 2 + Number(cycle.owner)).toBe(Number(cycle.total));
      expect(await activeCount(group.id)).toBe(3);
    });

    it('CA-001-07: un grupo lleno responde "No hay cupos disponibles" y no agrega a nadie', async () => {
      const group = await createGroup(2);
      await join(group);

      const error = await failure(addMember(group, await harness.insertUser()));

      expect(error.httpStatus).toBe(422);
      expect(error.code).toBe('BUSINESS_RULE');
      expect(error.message).toBe('No hay cupos disponibles.');
      expect(await activeCount(group.id)).toBe(2);
    });

    it('CA-001-19: dos altas simultáneas por el último cupo: exactamente una entra', async () => {
      const group = await createGroup(2);
      const [a, b] = [await harness.insertUser(), await harness.insertUser()];

      const results = await Promise.allSettled([addMember(group, a), addMember(group, b)]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await activeCount(group.id)).toBe(2);
    });

    it('RN-001-05: una persona no pertenece dos veces al mismo grupo', async () => {
      const group = await createGroup(3);
      const userId = await join(group);

      const error = await failure(addMember(group, userId));

      expect(error.details).toMatchObject({ rule: 'RN-001-05' });
    });

    it('RN-001-07: un grupo cerrado o congelado no admite miembros', async () => {
      const closed = await createGroup(3);
      await harness.pool.query(
        `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
        [closed.id],
      );
      expect((await failure(addMember(closed, await harness.insertUser()))).code).toBe(
        'GROUP_CLOSED',
      );

      const frozen = await createGroup(3);
      await harness.freezeGroup(frozen.id);
      expect((await failure(addMember(frozen, await harness.insertUser()))).code).toBe(
        'GROUP_FROZEN',
      );
    });
  });

  describe('DELETE /groups/:id/members/:userId', () => {
    it('RF-001-15: el titular quita al miembro, se conservan sus cobros y se informa cuántos debe', async () => {
      const group = await createGroup(4);
      const member = await join(group);
      await join(group);
      await harness.insertCharge(group, member);
      await harness.insertCharge(group, member, { period: '2026-11', status: 'atrasado' });
      removedEvents.length = 0;

      const response = await asUser(
        group.ownerId,
        'delete',
        `/groups/${group.id}/members/${member}`,
      ).expect(200);

      expect(response.body).toEqual({ removedUserId: member, openCharges: 2 });
      const stored = await harness.pool.query(
        'SELECT left_reason, left_at FROM group_members WHERE group_id = $1 AND user_id = $2',
        [group.id, member],
      );
      expect(stored.rows[0]).toMatchObject({ left_reason: 'quitado' });
      expect(stored.rows[0].left_at).not.toBeNull();
      const charges = await harness.pool.query(
        'SELECT count(*) AS n FROM charges WHERE user_id = $1',
        [member],
      );
      expect(Number(charges.rows[0].n)).toBe(2);
      expect(removedEvents).toEqual([
        { type: 'groups.member-removed', groupId: group.id, userId: member, reason: 'quitado' },
      ]);
    });

    it('RF-001-23 y CA-001-12: las cuotas de los demás se recalculan al quitar', async () => {
      const group = await createGroup(4);
      const member = await join(group);
      await join(group);
      expect((await initialCycle(group.id)).member_count).toBe(3);

      await asUser(group.ownerId, 'delete', `/groups/${group.id}/members/${member}`).expect(200);

      const cycle = await initialCycle(group.id);
      expect(cycle.member_count).toBe(2);
      expect(Number(cycle.base) + Number(cycle.owner)).toBe(Number(cycle.total));
    });

    it('RN-001-05: quitado, el miembro puede volver con una fila nueva', async () => {
      const group = await createGroup(3);
      const member = await join(group);
      await asUser(group.ownerId, 'delete', `/groups/${group.id}/members/${member}`).expect(200);

      await addMember(group, member);

      expect(await activeCount(group.id)).toBe(2);
    });

    it('RN-001-08: no se puede quitar al titular', async () => {
      const group = await createGroup(3);
      await join(group);

      const response = await asUser(
        group.ownerId,
        'delete',
        `/groups/${group.id}/members/${group.ownerId}`,
      ).expect(422);

      expect(response.body).toMatchObject({
        code: 'BUSINESS_RULE',
        details: { rule: 'RN-001-08' },
      });
      expect(await activeCount(group.id)).toBe(2);
    });

    it('CA-001-11: un miembro que intenta quitar a otro recibe 403', async () => {
      const group = await createGroup(4);
      const a = await join(group);
      const b = await join(group);

      await asUser(a, 'delete', `/groups/${group.id}/members/${b}`).expect(403);

      expect(await activeCount(group.id)).toBe(3);
    });

    it('CA-001-10: quien no pertenece al grupo recibe 404, y sin sesión 401', async () => {
      const group = await createGroup(3);
      const member = await join(group);
      const stranger = await harness.insertUser();

      await asUser(stranger, 'delete', `/groups/${group.id}/members/${member}`).expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/groups/${group.id}/members/${member}`)
        .expect(401);
      expect(await activeCount(group.id)).toBe(2);
    });

    it('RF-001-15: quitar a alguien que no es miembro activo responde 404', async () => {
      const group = await createGroup(3);
      const stranger = await harness.insertUser();

      await asUser(group.ownerId, 'delete', `/groups/${group.id}/members/${stranger}`).expect(404);
      await asUser(group.ownerId, 'delete', `/groups/${group.id}/members/no-es-uuid`).expect(404);
    });

    it('RN-001-07: un grupo cerrado no permite quitar miembros', async () => {
      const group = await createGroup(3);
      const member = await join(group);
      await harness.pool.query(
        `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
        [group.id],
      );

      const response = await asUser(
        group.ownerId,
        'delete',
        `/groups/${group.id}/members/${member}`,
      ).expect(422);

      expect(response.body.code).toBe('GROUP_CLOSED');
    });
  });

  describe('removeMember con razones del sistema', () => {
    it.each(['mora', 'baneo'] as const)(
      'RF-001-23: removeMember con razón %s registra el motivo y publica MemberRemoved',
      async (reason) => {
        const group = await createGroup(3);
        const member = await join(group);
        removedEvents.length = 0;

        const result = await membership.removeMember(group.id, member, reason);

        expect(result).toEqual({ removedUserId: member, openCharges: 0 });
        const stored = await harness.pool.query(
          'SELECT left_reason FROM group_members WHERE group_id = $1 AND user_id = $2',
          [group.id, member],
        );
        expect(stored.rows[0].left_reason).toBe(reason);
        expect(removedEvents).toEqual([
          { type: 'groups.member-removed', groupId: group.id, userId: member, reason },
        ]);
      },
    );

    it('RF-001-23: un grupo congelado igual retira por mora o baneo (proceso del sistema)', async () => {
      const group = await createGroup(3);
      const member = await join(group);
      await harness.freezeGroup(group.id);

      await membership.removeMember(group.id, member, 'baneo');

      expect(await activeCount(group.id)).toBe(1);
    });
  });

  describe('cobros abiertos (OpenChargesPort)', () => {
    it('CA-001-14: el adaptador cuenta pendiente, en_revision y atrasado, no los pagados', async () => {
      const group = await createGroup(4);
      const member = await join(group);
      await join(group);
      await harness.insertCharge(group, member);
      await harness.insertCharge(group, member, { period: '2026-11', status: 'en_revision' });
      await harness.insertCharge(group, member, { period: '2026-12', status: 'atrasado' });
      const paid = await harness.insertCharge(group, member, { period: '2027-01' });
      await harness.pool.query(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                cancel_reason = 'Prueba' WHERE id = $1`,
        [paid, group.ownerId],
      );
      const adapter = new OpenChargesAdapter();

      expect(await adapter.countOpenCharges(harness.pool, group.id, member)).toBe(3);
      expect(await adapter.countOpenCharges(harness.pool, group.id, group.ownerId)).toBe(0);
    });

    // El HTTP de abandonar (POST /groups/:id/leave) llega con la tarea T030.
    it.todo('CA-001-14: un miembro con cobros sin pagar no puede abandonar (T030)');
    it.todo('CA-001-15: el titular no puede abandonar y se le indica transferir o cerrar (T030)');
  });
});
