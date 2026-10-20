import request from 'supertest';
import { DomainError } from '../src/shared/errors/domain-error.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import type { JoinRequestOpened } from '../src/shared/events/join-request-events.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { inviteCodeOf, seedRequest, setClock } from './support/join-requests-fixtures.js';

// Apertura de solicitudes con código (spec 010 US1, T013) contra PostgreSQL real.
describe('POST /join-requests', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });

  const post = (userId: string, code: string): request.Test =>
    request(harness.app.getHttpServer())
      .post('/join-requests')
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send({ code });
  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    Number((await harness.pool.query<{ n: string }>(sql, params)).rows[0]?.n);
  const requestsOf = (applicantId: string): Promise<number> =>
    count('SELECT count(*)::text AS n FROM join_requests WHERE applicant_id = $1', [applicantId]);

  /** Grupo con un cupo libre y la persona que quiere entrar. */
  async function openGroup(members = 2): Promise<{ group: TestGroup; code: string; user: string }> {
    const group = await harness.createGroup({ members });
    return { group, code: await inviteCodeOf(harness, group.id), user: await harness.insertUser() };
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  afterEach(() => {
    setClock(harness, NOW);
  });

  it('CA-010-01: un código válido crea una solicitud abierta, con chat, sin cambiar los miembros', async () => {
    const { group, code, user } = await openGroup();
    const published: JoinRequestOpened[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<JoinRequestOpened>('join-requests.opened', (_tx, event) => {
        if (event.groupId === group.id) published.push(event);
      });

    // El código se normaliza: minúsculas y espacios (RF-010-01).
    const response = await post(
      user,
      ` ${code.slice(0, 4).toLowerCase()} ${code.slice(4)} `,
    ).expect(201);

    expect(response.body.phase.status).toBe('abierta');
    expect(response.body.quote).toBeNull();
    expect(response.body.paymentInfo).toBeNull();
    expect(response.body.allowedActions).toEqual(['cancel', 'sendMessage']);
    expect(response.body.timeline.map((e: { type: string }) => e.type)).toEqual(['abierta']);
    // 24 h desde la apertura: la ventana (hasta el 19) dura más (RN-010-06).
    expect(response.body.phase.deadlineAt).toBe('2026-10-17T15:00:00.000Z');
    expect(response.body.phase.deadlineKind).toBe('solicitud');
    expect(response.body.phase.serverNow).toBe(NOW);
    expect(response.body.applicant.userId).toBe(user);
    expect(response.body.host.userId).toBe(group.ownerId);
    // 3 miembros actuales: Bs 100,01 / (3 + 1) = Bs 25,00 estimado (RF-010-03).
    expect(response.body.estimatedShareCents).toBe(2500);
    expect(
      await count(
        `SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL`,
        [group.id],
      ),
    ).toBe(3);
    expect(published).toHaveLength(1);
    expect(published[0]?.hostId).toBe(group.ownerId);
  });

  it('CA-010-01: la solicitud abierta limita su plazo al fin de la ventana de ingreso (RN-010-06)', async () => {
    const { code, user } = await openGroup();
    harness.clock.advance(2 * 24 * 3600_000 + 8 * 3600_000); // 18 oct, 23:00 UTC = 19:00 La Paz
    const response = await post(user, code).expect(201);
    // La ventana termina el 19 de octubre a las 00:00 de La Paz = 04:00 UTC.
    expect(response.body.phase.deadlineAt).toBe('2026-10-19T04:00:00.000Z');
  });

  it('CA-010-02: quien ya es miembro, un grupo pausado, congelado o sin cupo se rechaza sin crear nada', async () => {
    const full = await openGroup(4); // titular + 4 = 5 de 5 cupos
    const paused = await openGroup();
    await harness.pool.query('UPDATE groups SET accepting_members = false WHERE id = $1', [
      paused.group.id,
    ]);
    const frozen = await openGroup();
    await harness.freezeGroup(frozen.group.id);
    const member = await openGroup();
    const memberId = member.group.memberIds[0] as string;

    const cases: [string, string, string, string][] = [
      [full.user, full.code, 'NO_SLOTS_AVAILABLE', 'RN-010-02'],
      [paused.user, paused.code, 'GROUP_NOT_ACCEPTING', 'RF-001-09'],
      [frozen.user, frozen.code, 'GROUP_FROZEN', 'RF-009-22'],
      [memberId, member.code, 'ALREADY_MEMBER', 'RN-001-05'],
    ];
    for (const [userId, code, expected, rule] of cases) {
      const response = await post(userId, code).expect(422);
      expect(response.body.code).toBe(expected);
      expect(response.body.details.rule).toBe(rule);
      expect(await requestsOf(userId)).toBe(0);
    }
  });

  it('CA-010-02: un grupo cerrado responde el mismo "Código inválido" genérico', async () => {
    const closed = await openGroup();
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [closed.group.id],
    );
    const unknown = await post(closed.user, 'ZZZZZZZZ').expect(422);
    const response = await post(closed.user, closed.code).expect(422);

    expect(response.body.code).toBe('INVALID_INVITE_CODE');
    expect(response.body.message).toBe(unknown.body.message);
    expect(await requestsOf(closed.user)).toBe(0);
  });

  it('CA-010-03: una segunda solicitud al mismo grupo se rechaza', async () => {
    const { code, user } = await openGroup();
    await post(user, code).expect(201);

    const again = await post(user, code).expect(422);

    expect(again.body.code).toBe('ACTIVE_REQUEST_EXISTS');
    expect(again.body.details.rule).toBe('RF-010-02');
  });

  it('CA-010-03: dos aperturas simultáneas al mismo grupo dejan una sola solicitud', async () => {
    const { group, code, user } = await openGroup();

    const results = await Promise.all([post(user, code), post(user, code)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(
      await count(
        'SELECT count(*)::text AS n FROM join_requests WHERE applicant_id = $1 AND group_id = $2',
        [user, group.id],
      ),
    ).toBe(1);
  });

  it('CA-010-03: la sexta solicitud activa se rechaza (máximo 5 en total)', async () => {
    const user = await harness.insertUser();
    for (let i = 0; i < 5; i++) {
      const group = await harness.createGroup({ members: 1 });
      await post(user, await inviteCodeOf(harness, group.id)).expect(201);
    }
    const sixth = await harness.createGroup({ members: 1 });

    const response = await post(user, await inviteCodeOf(harness, sixth.id)).expect(422);

    expect(response.body.code).toBe('TOO_MANY_ACTIVE_REQUESTS');
    expect(await requestsOf(user)).toBe(5);
  });

  it('CA-010-37: con la ventana cerrada se rechaza con la fecha de apertura y no se crea la solicitud', async () => {
    const { code, user } = await openGroup();
    harness.clock.advance(9 * 24 * 3600_000); // 25 oct: la ventana del 15 al 18 ya cerró

    const response = await post(user, code).expect(422);

    expect(response.body.code).toBe('ENTRY_WINDOW_CLOSED');
    expect(response.body.details).toEqual({
      rule: 'RF-001-22',
      opensAt: '2026-11-15T04:00:00.000Z',
    });
    expect(await requestsOf(user)).toBe(0);
  });

  it('CA-010-45 y RN-010-13: un retirado con un cobro atrasado o pendiente no puede volver', async () => {
    const overdue = await openGroup();
    const ex = overdue.group.memberIds[0] as string;
    await harness.insertCharge(overdue.group, ex, { status: 'atrasado' });
    await harness.leaveGroup(overdue.group.id, ex, 'mora');
    const pending = await openGroup();
    const ex2 = pending.group.memberIds[0] as string;
    await harness.insertCharge(pending.group, ex2, { period: '2026-09' });
    await harness.leaveGroup(pending.group.id, ex2, 'quitado');

    for (const [userId, code] of [
      [ex, overdue.code],
      [ex2, pending.code],
    ] as const) {
      const response = await post(userId, code).expect(422);
      expect(response.body.code).toBe('OPEN_CHARGES_IN_GROUP');
      expect(response.body.details.rule).toBe('RN-010-13');
      expect(await requestsOf(userId)).toBe(0);
    }
  });

  it('RN-010-13 (H3): un cobro no cancelado del período vigente también impide volver', async () => {
    const { group, code } = await openGroup();
    const ex = group.memberIds[0] as string;
    const chargeId = await harness.insertCharge(group, ex);
    // Ya pagado: no es un cobro «abierto», pero chocaría con `charges_member_period_uq` al confirmar.
    await harness.pool.query(
      `UPDATE charges SET status = 'pagado', paid_at = $2, settled_by = $3, settlement = 'manual' WHERE id = $1`,
      [chargeId, NOW, group.ownerId],
    );
    await harness.leaveGroup(group.id, ex);

    const response = await post(ex, code).expect(422);

    expect(response.body.code).toBe('OPEN_CHARGES_IN_GROUP');
  });

  it('RN-010-11: regenerar el código o pausar el grupo no afecta a las solicitudes abiertas', async () => {
    const { group, code, user } = await openGroup();
    const created = await post(user, code).expect(201);

    await harness.pool.query(
      'UPDATE groups SET invite_code = $2, accepting_members = false WHERE id = $1',
      [group.id, 'QWERTYPA'],
    );

    const detail = await get(user, `/join-requests/${created.body.id as string}`).expect(200);
    expect(detail.body.phase.status).toBe('abierta');
    const queue = await get(group.ownerId, `/groups/${group.id}/join-requests`).expect(200);
    expect(queue.body.items.map((r: { id: string }) => r.id)).toContain(created.body.id);
    // El código viejo ya no sirve para abrir otra solicitud.
    await post(await harness.insertUser(), code).expect(422);
  });

  it('RNF-010-03: una solicitud vencida no persistida no bloquea abrir otra (se persiste al abrir)', async () => {
    const { group, code, user } = await openGroup();
    const oldId = await seedRequest(harness, group, user, 'abierta', {
      openedAt: new Date(Date.parse(NOW) - 25 * 3600_000).toISOString(),
      openMinutes: 24 * 60,
    });

    const response = await post(user, code).expect(201);

    expect(response.body.id).not.toBe(oldId);
    const old = await harness.pool.query(
      'SELECT status, final_reason FROM join_requests WHERE id = $1',
      [oldId],
    );
    expect(old.rows[0]).toEqual({ status: 'expirada', final_reason: 'plazo_solicitud' });
    const events = await harness.pool.query(
      `SELECT type, actor_kind FROM join_request_events WHERE request_id = $1 ORDER BY occurred_at, created_at`,
      [oldId],
    );
    expect(events.rows.at(-1)).toEqual({ type: 'expirada', actor_kind: 'sistema' });
  });

  it('RF-001-07 y RNF-001-02: un código desconocido da el error genérico y 10 fallos en 15 min dan 429', async () => {
    const { code, user } = await openGroup();
    for (let i = 0; i < 10; i++) {
      const response = await post(user, 'ZZZZZZZZ').expect(422);
      expect(response.body.code).toBe('INVALID_INVITE_CODE');
      expect(response.body.message).toBe('Código inválido.');
    }

    const blocked = await post(user, code).expect(429);

    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(await requestsOf(user)).toBe(0);
    // Pasados 15 minutos vuelve a funcionar.
    harness.clock.advance(15 * 60_000 + 1000);
    await post(user, code).expect(201);
  });

  it('RNF-010-08: si falla un manejador del evento no queda ni la solicitud ni su línea de tiempo', async () => {
    const { group, code, user } = await openGroup();
    const bus = harness.app.get(TxEventBus, { strict: false });
    const failing = (): never => {
      throw new DomainError('BOOM', 500, 'falla simulada');
    };
    bus.register<JoinRequestOpened>('join-requests.opened', (_tx, event) => {
      if (event.groupId === group.id) failing();
    });

    await post(user, code).expect(500);

    expect(await requestsOf(user)).toBe(0);
    expect(
      await count(
        `SELECT count(*)::text AS n FROM join_request_events e JOIN join_requests r ON r.id = e.request_id WHERE r.applicant_id = $1`,
        [user],
      ),
    ).toBe(0);
  });

  it('sin sesión: 401', async () => {
    await request(harness.app.getHttpServer())
      .post('/join-requests')
      .send({ code: 'ABCDEFGH' })
      .expect(401);
  });

  it('cuerpo sin código: 400', async () => {
    const user = await harness.insertUser();
    await request(harness.app.getHttpServer())
      .post('/join-requests')
      .set('Authorization', `Bearer ${harness.token(user)}`)
      .send({})
      .expect(400);
  });
});
