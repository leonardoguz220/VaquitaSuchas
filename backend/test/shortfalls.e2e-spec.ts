import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { NotificationsModule } from '../src/modules/notifications/notifications.module.js';
import { ShortfallsModule } from '../src/modules/shortfalls/shortfalls.module.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { setClock } from './support/join-requests-fixtures.js';

// Faltante de grupo (spec 011) contra PostgreSQL real: cotización, ronda, respuestas, pago
// adicional, devolución, tarea de plazos y avisos.
describe('Faltante de grupo (spec 011)', () => {
  const harness = new BillingHarness({ imports: [ShortfallsModule, NotificationsModule] });
  let group: TestGroup;
  let a: string;
  let b: string;
  let c: string;

  const auth = (test: request.Test, userId: string): request.Test =>
    test.set('Authorization', `Bearer ${harness.token(userId)}`);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test => auth(http().get(url), userId);
  const post = (userId: string, url: string, body: object = {}): request.Test =>
    auth(http().post(url), userId).send(body);
  const at = (hours: number): string => new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();
  const sweep = async (): Promise<void> => {
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'shortfalls.sweep' });
    expect(result).toMatchObject({ job: 'shortfalls.sweep', status: 'ok' });
  };

  /** Grupo con titular + A, B y C; ciclo 2026-11 de 4 miembros (cuota 25,00) y los tres pagaron. */
  async function seedPaidGroup(): Promise<void> {
    group = await harness.createGroup({ members: 3 });
    [a, b, c] = group.memberIds as [string, string, string];
    const cycle = await harness.pool.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, total_bs_cents, member_count,
                                   base_share_cents, owner_share_cents, remainder_cents,
                                   finalized_at)
       VALUES ($1, '2026-11', $2, 'regular', '2026-11-15', '2026-11-18', '2026-11-15T04:00:00Z',
               10000, 'BS', 10000, 4, 2500, 2500, 0, '2026-11-15T04:00:00Z')
       RETURNING id`,
      [group.id, group.ownerId],
    );
    const cycleId = (cycle.rows[0] as { id: string }).id;
    for (const userId of [a, b, c]) {
      await harness.pool.query(
        `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                              price_cents, currency, total_bs_cents, member_count, issued_at, due_at)
         VALUES ($1, $2, $3, '2026-11', 'ciclo', 'pendiente', 2500, 10000, 'BS', 10000, 4,
                 '2026-11-15T04:00:00Z', '2026-11-19T04:00:00Z')`,
        [group.id, userId, cycleId],
      );
      await harness.pool.query(
        `UPDATE charges SET status = 'pagado', paid_at = '2026-11-15T10:00:00Z', settled_by = $3,
                settlement = 'manual' WHERE group_id = $1 AND user_id = $2`,
        [group.id, userId, group.ownerId],
      );
    }
  }

  /** C deja el grupo: quedan titular, A y B (3 miembros) y A y B deben agregar Bs 8,33. */
  async function openRound(): Promise<{ roundId: string; rows: Record<string, string> }> {
    await harness.leaveGroup(group.id, c);
    const response = await post(group.ownerId, `/groups/${group.id}/shortfall`).expect(201);
    const rows: Record<string, string> = {};
    for (const row of response.body.rows) rows[row.member.userId] = row.id;
    return { roundId: response.body.id, rows };
  }

  const rowState = async (rowId: string): Promise<Record<string, unknown>> =>
    (
      await harness.pool.query(
        `SELECT choice, extra_status, refund_status, refund_amount_cents::int AS refund_amount
           FROM shortfall_responses WHERE id = $1`,
        [rowId],
      )
    ).rows[0] as Record<string, unknown>;
  const roundStatus = async (roundId: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM shortfall_rounds WHERE id = $1',
        [roundId],
      )
    ).rows[0]?.status as string;
  const isActiveMember = async (userId: string): Promise<boolean> =>
    ((
      await harness.pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL',
        [group.id, userId],
      )
    ).rowCount ?? 0) > 0;
  const noticesOf = async (userId: string, type: string): Promise<number> =>
    (
      await harness.pool.query('SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2', [
        userId,
        type,
      ])
    ).rowCount ?? 0;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    setClock(harness, NOW);
    await seedPaidGroup();
  });
  afterEach(() => {
    setClock(harness, NOW);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('cotización y apertura', () => {
    it('CA-011-01: Bs 100,00, 3 miembros que se quedan → cuota Bs 33,33; A y B agregan Bs 8,33', async () => {
      await harness.leaveGroup(group.id, c);

      const response = await get(group.ownerId, `/groups/${group.id}/shortfall/preview`).expect(
        200,
      );

      expect(response.body).toMatchObject({
        period: '2026-11',
        totalBsCents: 10000,
        memberCountAfter: 3,
        baseShareCents: 3333,
        ownerShareCents: 3334,
        shortfallCents: 1666,
      });
      expect(response.body.rows.map((r: { extraDueCents: number }) => r.extraDueCents)).toEqual([
        833, 833,
      ]);
    });

    it('CA-011-02: sin diferencia no se abre la ronda', async () => {
      const response = await post(group.ownerId, `/groups/${group.id}/shortfall`).expect(422);

      expect(response.body.code).toBe('NO_SHORTFALL');
    });

    it('CA-011-03: abre la ronda con plazos, filas de A y B y un aviso para cada uno', async () => {
      const { roundId, rows } = await openRound();

      const round = await get(group.ownerId, `/groups/${group.id}/shortfall`).expect(200);
      expect(round.body).toMatchObject({ id: roundId, status: 'abierta', shortfallCents: 1666 });
      expect(Object.keys(rows).sort()).toEqual([a, b].sort());
      expect(Date.parse(round.body.respondBy)).toBe(Date.parse(at(48)));
      expect(Date.parse(round.body.payBy)).toBe(Date.parse(at(96)));
      expect(await noticesOf(a, 'faltante_abierto')).toBe(1);
      expect(await noticesOf(b, 'faltante_abierto')).toBe(1);
    });

    it('CA-011-04: con una ronda abierta no se abre otra', async () => {
      await openRound();

      const response = await post(group.ownerId, `/groups/${group.id}/shortfall`).expect(422);

      expect(response.body.code).toBe('ROUND_ALREADY_OPEN');
    });

    it('CA-011-14: un grupo congelado no admite abrir la ronda', async () => {
      await harness.leaveGroup(group.id, c);
      await harness.freezeGroup(group.id);

      const response = await post(group.ownerId, `/groups/${group.id}/shortfall`).expect(422);

      expect(response.body.code).toBe('GROUP_FROZEN');
    });

    it('RF-011-06: el titular cancela si nadie respondió, y no si ya hubo respuestas', async () => {
      const { roundId, rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);

      const blocked = await post(group.ownerId, `/shortfall-rounds/${roundId}/cancel`).expect(422);
      expect(blocked.body.code).toBe('ROUND_HAS_RESPONSES');

      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(409);
    });

    it('RF-011-06: cancelar una ronda sin respuestas la deja cancelada', async () => {
      const { roundId } = await openRound();

      await post(group.ownerId, `/shortfall-rounds/${roundId}/cancel`).expect(200);

      expect(await roundStatus(roundId)).toBe('cancelada');
    });
  });

  describe('permisos (CA-011-13)', () => {
    it('un afectado ve solo su fila; otro miembro no afectado recibe 403; un ajeno, 404', async () => {
      await openRound();
      const outsider = await harness.insertUser();

      const own = await get(a, `/groups/${group.id}/shortfall`).expect(200);
      expect(own.body.rows).toHaveLength(1);
      expect(own.body.rows[0].member.userId).toBe(a);

      const all = await get(group.ownerId, `/groups/${group.id}/shortfall`).expect(200);
      expect(all.body.rows).toHaveLength(2);

      await get(outsider, `/groups/${group.id}/shortfall`).expect(404);
      await post(a, `/groups/${group.id}/shortfall`).expect(403);
      await post(outsider, `/groups/${group.id}/shortfall`).expect(404);
    });

    it('solo el afectado responde su fila y solo el titular confirma', async () => {
      const { rows } = await openRound();

      await post(b, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(403);
      await post(group.ownerId, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(
        403,
      );
      await post(a, `/shortfall-rows/${rows[a]}/confirm-payment`).expect(403);
    });
  });

  describe('cubrir (CA-011-05, 07 y 12)', () => {
    it('cubrir, informar, confirmar; con A y B resueltos la ronda se cierra', async () => {
      const { roundId, rows } = await openRound();

      const covered = await post(a, `/shortfall-rows/${rows[a]}/respond`, {
        choice: 'cubrir',
      }).expect(200);
      expect(covered.body).toMatchObject({ choice: 'cubrir', extra: { status: 'pendiente_pago' } });
      expect(covered.body.allowedActions).toEqual(['pay']);

      await post(a, `/shortfall-rows/${rows[a]}/pay`, {
        method: 'qr',
        reference: 'EXTRA-1',
      }).expect(200);
      expect(await noticesOf(group.ownerId, 'faltante_pago_informado')).toBe(1);

      await post(group.ownerId, `/shortfall-rows/${rows[a]}/confirm-payment`).expect(200);
      expect(await noticesOf(a, 'faltante_pago_resuelto')).toBe(1);
      expect(await roundStatus(roundId)).toBe('abierta');

      await post(b, `/shortfall-rows/${rows[b]}/respond`, { choice: 'cubrir' }).expect(200);
      await post(b, `/shortfall-rows/${rows[b]}/pay`, {
        method: 'transferencia',
        reference: 'EXTRA-2',
      }).expect(200);
      await post(group.ownerId, `/shortfall-rows/${rows[b]}/confirm-payment`).expect(200);

      expect(await roundStatus(roundId)).toBe('cerrada');
      expect(await noticesOf(a, 'faltante_cerrado')).toBe(1);
      expect(await noticesOf(group.ownerId, 'faltante_cerrado')).toBe(1);
    });

    it('CA-011-07: rechazar el pago con motivo lo devuelve a pendiente de pago', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);
      await post(a, `/shortfall-rows/${rows[a]}/pay`, {
        method: 'qr',
        reference: 'EXTRA-1',
      }).expect(200);

      const rejected = await post(group.ownerId, `/shortfall-rows/${rows[a]}/reject-payment`, {
        reason: 'No llegó a mi cuenta',
      }).expect(200);

      expect(rejected.body.extra).toMatchObject({
        status: 'pendiente_pago',
        rejectReason: 'No llegó a mi cuenta',
      });
      await post(group.ownerId, `/shortfall-rows/${rows[a]}/reject-payment`, {
        reason: 'Otra vez',
      }).expect(409);
    });

    it('una referencia vacía o larga se rechaza con 400', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);

      await post(a, `/shortfall-rows/${rows[a]}/pay`, { method: 'qr', reference: '   ' }).expect(
        400,
      );
      await post(a, `/shortfall-rows/${rows[a]}/pay`, {
        method: 'qr',
        reference: 'x'.repeat(101),
      }).expect(400);
    });
  });

  describe('devolución (CA-011-06, 10 y 11)', () => {
    it('pedir devolución saca a la persona del grupo y abre la devolución por lo pagado', async () => {
      const { rows } = await openRound();

      const response = await post(a, `/shortfall-rows/${rows[a]}/respond`, {
        choice: 'devolucion',
      }).expect(200);

      expect(response.body.refund).toMatchObject({ status: 'pendiente', amountCents: 2500 });
      expect(await isActiveMember(a)).toBe(false);
      expect(await rowState(rows[a] as string)).toMatchObject({
        choice: 'devolucion',
        refund_amount: 2500,
      });
      expect(await noticesOf(group.ownerId, 'devolucion_pendiente')).toBe(1);
    });

    it('el titular registra la devolución y la persona, ya fuera del grupo, la confirma', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'devolucion' }).expect(200);

      await post(a, `/shortfall-rows/${rows[a]}/refund`, {
        method: 'qr',
        reference: 'DEV-1',
      }).expect(403);
      await post(group.ownerId, `/shortfall-rows/${rows[a]}/refund`, {
        method: 'qr',
        reference: 'DEV-1',
      }).expect(200);
      expect(await noticesOf(a, 'devolucion_registrada')).toBe(1);

      const confirmed = await post(a, `/shortfall-rows/${rows[a]}/refund/confirm`).expect(200);

      expect(confirmed.body.refund.status).toBe('confirmada');
      expect(await noticesOf(group.ownerId, 'devolucion_resuelta')).toBe(1);
    });

    it('la persona disputa una devolución registrada y el titular es avisado', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'devolucion' }).expect(200);
      await post(group.ownerId, `/shortfall-rows/${rows[a]}/refund`, {
        method: 'transferencia',
        reference: 'DEV-2',
      }).expect(200);

      const disputed = await post(a, `/shortfall-rows/${rows[a]}/refund/dispute`, {
        reason: 'No me llegó nada',
      }).expect(200);

      expect(disputed.body.refund).toMatchObject({
        status: 'disputada',
        disputeReason: 'No me llegó nada',
      });
      await post(a, `/shortfall-rows/${rows[a]}/refund/confirm`).expect(409);
    });

    it('sin registro del titular solo se puede disputar pasados 5 días', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'devolucion' }).expect(200);

      await post(a, `/shortfall-rows/${rows[a]}/refund/dispute`, { reason: 'No devuelve' }).expect(
        409,
      );

      setClock(harness, at(24 * 5 + 1));
      await post(a, `/shortfall-rows/${rows[a]}/refund/dispute`, { reason: 'No devuelve' }).expect(
        200,
      );
    });

    it('CA-011-16: el administrador ve la devolución disputada y los demás no acceden', async () => {
      const { rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'devolucion' }).expect(200);
      await post(group.ownerId, `/shortfall-rows/${rows[a]}/refund`, {
        method: 'qr',
        reference: 'DEV-3',
      }).expect(200);
      await post(a, `/shortfall-rows/${rows[a]}/refund/dispute`, { reason: 'No me llegó' }).expect(
        200,
      );
      await harness.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [c]);

      await get(a, '/admin/shortfall-disputes').expect(403);
      await get(group.ownerId, '/admin/shortfall-disputes').expect(403);
      const queue = await get(c, '/admin/shortfall-disputes').expect(200);

      const item = queue.body.items.find((i: { rowId: string }) => i.rowId === rows[a]);
      expect(item).toMatchObject({
        rowId: rows[a],
        groupId: group.id,
        period: '2026-11',
        refundAmountCents: 2500,
        refundMethod: 'qr',
        refundReference: 'DEV-3',
        disputeReason: 'No me llegó',
      });
    });

    it('una versión vieja responde 409 STALE_STATE', async () => {
      const { rows } = await openRound();

      const response = await post(a, `/shortfall-rows/${rows[a]}/respond`, {
        choice: 'cubrir',
        version: 99,
      }).expect(409);

      expect(response.body.code).toBe('STALE_STATE');
    });
  });

  describe('tarea shortfalls.sweep (CA-011-08, 09 y 12)', () => {
    it('CA-011-08: al vencer el plazo sin respuesta pasa a devolución y la persona sale', async () => {
      const { roundId, rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);
      await post(a, `/shortfall-rows/${rows[a]}/pay`, {
        method: 'qr',
        reference: 'EXTRA-1',
      }).expect(200);

      setClock(harness, at(49));
      await sweep();

      expect(await rowState(rows[b] as string)).toMatchObject({
        choice: 'sin_respuesta',
        refund_status: 'pendiente',
        refund_amount: 2500,
      });
      expect(await isActiveMember(b)).toBe(false);
      expect(await isActiveMember(a)).toBe(true);
      expect(await roundStatus(roundId)).toBe('abierta');
    });

    it('CA-011-09 y 12: un pago sin informar que vence pasa a devolución y cierra la ronda', async () => {
      const { roundId, rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);
      await post(b, `/shortfall-rows/${rows[b]}/respond`, { choice: 'devolucion' }).expect(200);

      setClock(harness, at(49));
      await sweep();

      expect(await rowState(rows[a] as string)).toMatchObject({
        choice: 'sin_respuesta',
        extra_status: 'vencido',
        refund_status: 'pendiente',
      });
      expect(await roundStatus(roundId)).toBe('cerrada');
    });

    it('un pago informado y sin decidir no vence ni cierra la ronda', async () => {
      const { roundId, rows } = await openRound();
      await post(a, `/shortfall-rows/${rows[a]}/respond`, { choice: 'cubrir' }).expect(200);
      await post(a, `/shortfall-rows/${rows[a]}/pay`, {
        method: 'qr',
        reference: 'EXTRA-1',
      }).expect(200);
      await post(b, `/shortfall-rows/${rows[b]}/respond`, { choice: 'devolucion' }).expect(200);

      setClock(harness, at(200));
      await sweep();

      expect(await rowState(rows[a] as string)).toMatchObject({ extra_status: 'informado' });
      expect(await roundStatus(roundId)).toBe('abierta');
    });

    it('es idempotente: correrla dos veces no repite avisos ni devoluciones', async () => {
      const { rows } = await openRound();

      setClock(harness, at(49));
      await sweep();
      await sweep();

      expect(await noticesOf(group.ownerId, 'devolucion_pendiente')).toBe(2);
      expect(await rowState(rows[a] as string)).toMatchObject({ choice: 'sin_respuesta' });
    });

    it('RF-011-04: pasado el plazo ya no se puede responder', async () => {
      const { rows } = await openRound();

      setClock(harness, at(49));
      const response = await post(a, `/shortfall-rows/${rows[a]}/respond`, {
        choice: 'cubrir',
      }).expect(422);

      expect(response.body.code).toBe('DEADLINE_PASSED');
    });
  });

  describe('mis faltantes', () => {
    it('HU-011-02: la persona ve sus filas con las acciones que puede hacer', async () => {
      await openRound();

      const response = await get(a, '/me/shortfalls').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].row).toMatchObject({
        extraDueCents: 833,
        allowedActions: ['cover', 'requestRefund'],
      });
      expect(response.body[0].round.status).toBe('abierta');
    });
  });
});
