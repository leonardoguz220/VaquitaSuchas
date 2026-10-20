import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { DbService } from '../src/shared/db/db.service.js';
import type { DomainEvent } from '../src/shared/events/domain-event.js';
import type {
  JoinRequestCancelled,
  JoinRequestRejected,
} from '../src/shared/events/join-request-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import {
  inviteCodeOf,
  seedRequest,
  setClock,
  type SeedState,
} from './support/join-requests-fixtures.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';

// Eventos de grupos y de cuentas sobre las solicitudes (spec 010 US7, T041/T043) contra
// PostgreSQL real. Los eventos se publican por el bus dentro de una transacción, como hace cada spec.
describe('Solicitudes de ingreso ante eventos de grupos y cuentas', () => {
  const harness = new BillingHarness({
    imports: [JoinRequestsModule],
    configure: (builder) =>
      builder
        .overrideProvider(HOST_ELIGIBILITY_PORT)
        .useValue({ check: () => Promise.resolve({ eligible: true, source: 'manual' }) }),
  });
  const rejected: JoinRequestRejected[] = [];
  const cancelled: JoinRequestCancelled[] = [];
  let group: TestGroup;
  let applicant: string;

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const call = (method: 'get' | 'post', userId: string, url: string): request.Test =>
    http()
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const publish = (event: DomainEvent): Promise<void> =>
    harness.app
      .get(DbService, { strict: false })
      .withTransaction((tx) => harness.app.get(TxEventBus, { strict: false }).publish(tx, event));
  const row = async (id: string) =>
    (
      await harness.pool.query<{ status: string; final_reason: string | null; version: number }>(
        'SELECT status, final_reason, version FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0] as { status: string; final_reason: string | null; version: number };
  const eventsOf = async (id: string) =>
    (
      await harness.pool.query<{ type: string; actor_kind: string; reason: string | null }>(
        'SELECT type, actor_kind, reason FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at, id',
        [id],
      )
    ).rows;
  const activeReferences = async (): Promise<number> =>
    Number(
      (
        await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM payment_references WHERE group_id = $1 AND released_at IS NULL',
          [group.id],
        )
      ).rows[0]?.n,
    );
  const seed = async (state: SeedState, userId?: string): Promise<string> =>
    seedRequest(harness, group, userId ?? (await harness.insertUser()), state);

  beforeAll(async () => {
    await harness.start();
    const bus = harness.app.get(TxEventBus, { strict: false });
    bus.register<JoinRequestRejected>('join-requests.rejected', (_tx, event) => {
      rejected.push(event);
    });
    bus.register<JoinRequestCancelled>('join-requests.cancelled', (_tx, event) => {
      cancelled.push(event);
    });
  }, 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    group = await harness.createGroup({ members: 1 });
    applicant = await harness.insertUser();
    rejected.length = 0;
    cancelled.length = 0;
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('GroupClosed', () => {
    it('CA-010-32: al cerrar el grupo, las solicitudes abiertas pasan a rechazada por el sistema (grupo_cerrado)', async () => {
      const id = await seed('abierta', applicant);
      const ended = await seed('rechazada');

      await call('post', group.ownerId, `/groups/${group.id}/close`).expect(200);

      expect(await row(id)).toMatchObject({ status: 'rechazada', final_reason: 'grupo_cerrado' });
      expect(await eventsOf(id)).toEqual([
        { type: 'abierta', actor_kind: 'usuario', reason: null },
        { type: 'rechazada', actor_kind: 'sistema', reason: 'grupo_cerrado' },
      ]);
      expect(rejected).toEqual([
        expect.objectContaining({
          requestId: id,
          hostId: group.ownerId,
          applicantId: applicant,
          reason: 'grupo_cerrado',
          byHost: false,
          rejectedAsFalse: false,
        }),
      ]);
      // Las que ya estaban en un estado final no cambian.
      expect((await row(ended)).final_reason).toBe('rechazo_titular');
      const seen = await call('get', applicant, `/join-requests/${id}`).expect(200);
      expect(seen.body).toMatchObject({
        phase: { status: 'rechazada' },
        finalReason: 'grupo_cerrado',
      });
    });

    it('CA-010-32: repetir el evento no cambia nada', async () => {
      const id = await seed('abierta', applicant);
      await publish({ type: 'groups.closed', groupId: group.id } as DomainEvent);
      const version = (await row(id)).version;

      await publish({ type: 'groups.closed', groupId: group.id } as DomainEvent);

      expect((await row(id)).version).toBe(version);
      expect(rejected).toHaveLength(1);
    });

    it('CA-010-32: una solicitud vencida pero no persistida queda expirada, no rechazada', async () => {
      const id = await seedRequest(harness, group, applicant, 'abierta', { openMinutes: 10 });
      setClock(harness, new Date(Date.parse(NOW) + 11 * 60_000).toISOString());

      await publish({ type: 'groups.closed', groupId: group.id } as DomainEvent);

      expect(await row(id)).toMatchObject({ status: 'expirada', final_reason: 'ventana_cerrada' });
      expect(rejected).toHaveLength(0);
    });

    it('CA-010-32: no toca las solicitudes de otros grupos', async () => {
      const other = await harness.createGroup({ members: 1 });
      const mine = await seed('abierta');
      const theirs = await seedRequest(harness, other, await harness.insertUser(), 'abierta');

      await publish({ type: 'groups.closed', groupId: group.id } as DomainEvent);

      expect((await row(mine)).status).toBe('rechazada');
      expect((await row(theirs)).status).toBe('abierta');
    });
  });

  describe('UserBanned del titular', () => {
    it.each<SeedState>(['abierta', 'esperando_pago', 'pago_informado'])(
      'CA-010-32: el baneo del titular rechaza la solicitud %s (titular_baneado) y libera la referencia',
      async (state) => {
        const id = await seed(state, applicant);
        if (state === 'pago_informado') {
          await harness.pool.query(
            `INSERT INTO payment_references (group_id, reference_key, source_type, source_id)
             VALUES ($1, 'ref-ban', 'join_request', $2)`,
            [group.id, id],
          );
          expect(await activeReferences()).toBe(1);
        }

        await publish({ type: 'users.banned', userId: group.ownerId } as DomainEvent);

        expect(await row(id)).toMatchObject({
          status: 'rechazada',
          final_reason: 'titular_baneado',
        });
        expect(await activeReferences()).toBe(0);
        expect(rejected).toEqual([
          expect.objectContaining({ requestId: id, reason: 'titular_baneado', byHost: false }),
        ]);
      },
    );

    it('CA-010-32: el baneo de un miembro cualquiera no toca las solicitudes del grupo', async () => {
      const id = await seed('abierta', applicant);

      await publish({ type: 'users.banned', userId: group.memberIds[0] as string } as DomainEvent);

      expect((await row(id)).status).toBe('abierta');
    });
  });

  describe('UserSuspended y UserBanned del solicitante', () => {
    it.each(['users.suspended', 'users.banned'] as const)(
      'CA-010-34: %s cancela las solicitudes activas de la persona (solicitante_suspendido)',
      async (type) => {
        const other = await harness.createGroup({ members: 1 });
        const [a, b] = [
          await seed('abierta', applicant),
          await seedRequest(harness, other, applicant, 'pago_informado'),
        ];
        const ended = await seedRequest(
          harness,
          await harness.createGroup({ members: 1 }),
          applicant,
          'rechazada',
        );
        const bystander = await seed('abierta');

        await publish({ type, userId: applicant } as DomainEvent);

        for (const id of [a, b]) {
          expect(await row(id)).toMatchObject({
            status: 'cancelada',
            final_reason: 'solicitante_suspendido',
          });
          expect((await eventsOf(id)).at(-1)).toEqual({
            type: 'cancelada',
            actor_kind: 'sistema',
            reason: 'solicitante_suspendido',
          });
        }
        expect((await row(ended)).status).toBe('rechazada');
        expect((await row(bystander)).status).toBe('abierta');
        expect(cancelled).toHaveLength(2);
        expect(cancelled[0]).toMatchObject({
          applicantId: applicant,
          reason: 'solicitante_suspendido',
          bySystem: true,
        });
      },
    );

    it('CA-010-34: una cuenta suspendida no puede abrir una solicitud nueva', async () => {
      await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [applicant]);

      const response = await call('post', applicant, '/join-requests')
        .send({ code: await inviteCodeOf(harness, group.id) })
        .expect(401);

      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('CA-010-34: la reactivación no restituye las solicitudes canceladas', async () => {
      const id = await seed('abierta', applicant);
      await publish({ type: 'users.suspended', userId: applicant } as DomainEvent);
      await publish({ type: 'users.reactivated', userId: applicant } as DomainEvent);

      expect((await row(id)).status).toBe('cancelada');
    });
  });

  describe('OwnershipBlockersPort y cupos reservados', () => {
    it.each<SeedState>(['esperando_pago', 'pago_informado'])(
      'CA-010-33 y RN-010-09: con una solicitud %s no se transfiere la titularidad ni se cierra el grupo',
      async (state) => {
        const id = await seed(state, applicant);
        const target = group.memberIds[0] as string;

        const transfer = await call('post', group.ownerId, `/groups/${group.id}/transfer-ownership`)
          .send({ toUserId: target })
          .expect(422);
        const close = await call('post', group.ownerId, `/groups/${group.id}/close`).expect(422);

        for (const response of [transfer, close]) {
          expect(response.body).toMatchObject({
            code: 'BUSINESS_RULE',
            details: { rule: 'RN-010-09' },
          });
        }
        expect((await row(id)).status).toBe(state);
        expect(
          (await harness.pool.query('SELECT owner_id FROM groups WHERE id = $1', [group.id]))
            .rows[0].owner_id,
        ).toBe(group.ownerId);
      },
    );

    it('CA-010-33: sin solicitudes en pago (solo abiertas o finales) sí se puede transferir', async () => {
      await seed('abierta');
      await seed('rechazada');

      await call('post', group.ownerId, `/groups/${group.id}/transfer-ownership`)
        .send({ toUserId: group.memberIds[0] })
        .expect(200);
    });

    it('CA-010-33: una solicitud en pago cuyo plazo ya venció no bloquea (se evalúa expirada)', async () => {
      const id = await seed('esperando_pago', applicant);
      await harness.pool.query(`UPDATE join_requests SET pay_deadline_at = $2 WHERE id = $1`, [
        id,
        new Date(Date.parse(NOW) + 15 * 60_000).toISOString(),
      ]);
      setClock(harness, new Date(Date.parse(NOW) + 16 * 60_000).toISOString());

      await call('post', group.ownerId, `/groups/${group.id}/transfer-ownership`)
        .send({ toUserId: group.memberIds[0] })
        .expect(200);
    });

    it('RN-010-02 y RN-010-09: ReservedSlotsQuery cuenta solo las solicitudes en pago con plazo vigente', async () => {
      const { RESERVED_SLOTS_QUERY } =
        await import('../src/modules/join-requests/ports/reserved-slots.query.js');
      const query = harness.app.get(RESERVED_SLOTS_QUERY, { strict: false }) as {
        count(q: unknown, groupId: string, now: Date): Promise<number>;
      };
      await seed('abierta');
      await seed('esperando_pago');
      await seed('pago_informado');
      await seed('rechazada');

      expect(await query.count(harness.pool, group.id, new Date(NOW))).toBe(2);
      expect(
        await query.count(harness.pool, group.id, new Date(Date.parse(NOW) + 48 * 3600_000)),
      ).toBe(0);
    });
  });
});
