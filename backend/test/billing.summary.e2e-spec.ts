import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';

// Resumen del mes e historial del grupo (spec 002, US5, T035/T036) contra PostgreSQL real.
describe('Resumen del mes e historial del grupo', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let titular: string;
  let members: string[];

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  /** Cobro `pagado` por pago manual (la transición pendiente -> pagado la permite la base). */
  async function insertPaid(userId: string, period = '2026-10'): Promise<string> {
    const id = await harness.insertCharge(group, userId, {
      period,
      dueAt: period === '2026-10' ? undefined : `${period}-19T04:00:00.000Z`,
    });
    await harness.pool.query(
      `UPDATE charges SET status = 'pagado', paid_at = '2026-10-16T12:00:00Z', settled_by = $2,
                          settlement = 'manual' WHERE id = $1`,
      [id, titular],
    );
    return id;
  }

  /** Cobro de un período; el ciclo del período se crea una sola vez. */
  async function chargeIn(userId: string, period: string): Promise<string> {
    const cycle = await harness.pool.query<{ id: string }>(
      `SELECT id FROM billing_cycles WHERE group_id = $1 AND period = $2`,
      [group.id, period],
    );
    if (!cycle.rows[0]) {
      return harness.insertCharge(group, userId, { period, dueAt: `${period}-19T04:00:00.000Z` });
    }
    const result = await harness.pool.query<{ id: string }>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                            price_cents, currency, total_bs_cents, member_count, issued_at, due_at)
       VALUES ($1, $2, $3, $4, 'ciclo', 'pendiente', 3333, 10001, 'BS', 10001, 3,
               $5::timestamptz, $6) RETURNING id`,
      [
        group.id,
        userId,
        cycle.rows[0].id,
        period,
        `${period}-15T04:00:00Z`,
        `${period}-19T04:00:00.000Z`,
      ],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async function insertEvent(
    chargeId: string,
    type: string,
    actorId: string | null,
    occurredAt: string,
    reason: string | null = null,
  ): Promise<void> {
    await harness.pool.query(
      `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, reason, metadata,
                                  occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, '{"invalidReceipt":true}', $7)`,
      [chargeId, group.id, type, actorId ? 'usuario' : 'sistema', actorId, reason, occurredAt],
    );
  }

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 4, ownerName: 'Titular Suchas' });
    titular = group.ownerId;
    members = group.memberIds;
    harness.storage.files.clear();
  });

  describe('GET /groups/:groupId/billing/summary', () => {
    it('CA-002-17: un miembro ve estado y monto de todos, pero ningún comprobante ni referencia ajena', async () => {
      const mine = await harness.insertCharge(group, members[0] as string);
      const theirs = await harness.insertCharge(group, members[1] as string, {
        status: 'en_revision',
      });
      const receipt = await harness.insertReceipt(theirs, members[1] as string, {
        reference: 'REF-SECRETA-999',
      });

      const response = await get(
        members[0] as string,
        `/groups/${group.id}/billing/summary`,
      ).expect(200);

      expect(response.body).toMatchObject({
        period: '2026-10',
        cycleType: 'regular',
        cutDate: '2026-10-15',
        dueAt: '2026-10-19T04:00:00.000Z',
        totalBsCents: 10001,
        memberCount: 3,
        baseShareCents: 3333,
        ownerShareCents: 3335,
        availablePeriods: ['2026-10'],
      });
      const rows = response.body.rows as {
        charge: { id: string; status: string; amountCents: number };
      }[];
      expect(rows.map((r) => r.charge.id).sort()).toEqual([mine, theirs].sort());
      expect(rows.find((r) => r.charge.id === theirs)?.charge).toMatchObject({
        status: 'en_revision',
        amountCents: 3333,
      });
      const text = JSON.stringify(response.body);
      for (const secret of [
        'REF-SECRETA-999',
        receipt.id,
        receipt.fileKey,
        'receipts',
        'reference',
      ]) {
        expect(text).not.toContain(secret);
      }
      expect(response.body).not.toHaveProperty('ownerTotals');
    });

    it('CA-002-20: el titular ve los totales esperado, cobrado, pendiente y atrasado', async () => {
      await insertPaid(members[0] as string);
      await insertPaid(members[1] as string);
      await harness.insertCharge(group, members[2] as string, { status: 'en_revision' });
      await harness.insertCharge(group, members[3] as string, { status: 'atrasado' });

      const response = await get(
        titular,
        `/groups/${group.id}/billing/summary?period=2026-10`,
      ).expect(200);

      expect(response.body.ownerTotals).toEqual({
        expectedCents: 13332,
        collectedCents: 6666,
        pendingCents: 3333,
        overdueCents: 3333,
      });
      const { expectedCents, collectedCents, pendingCents, overdueCents } =
        response.body.ownerTotals;
      expect(expectedCents).toBe(collectedCents + pendingCents + overdueCents);
      expect(response.body.rows).toHaveLength(4);
    });

    it('CA-002-20: un cobro cancelado no cuenta en el esperado', async () => {
      await insertPaid(members[0] as string);
      const cancelled = await harness.insertCharge(group, members[1] as string);
      await harness.pool.query(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                            cancel_reason = 'Salió del grupo' WHERE id = $1`,
        [cancelled, titular],
      );

      const response = await get(titular, `/groups/${group.id}/billing/summary`).expect(200);

      expect(response.body.ownerTotals).toEqual({
        expectedCents: 3333,
        collectedCents: 3333,
        pendingCents: 0,
        overdueCents: 0,
      });
    });

    it('RF-002-16: por omisión usa el último ciclo y lista los períodos disponibles', async () => {
      await harness.insertCharge(group, members[0] as string, {
        period: '2026-09',
        dueAt: '2026-09-19T04:00:00.000Z',
      });
      await harness.insertCharge(group, members[0] as string);

      const latest = await get(members[0] as string, `/groups/${group.id}/billing/summary`).expect(
        200,
      );
      expect(latest.body.period).toBe('2026-10');
      expect(latest.body.availablePeriods).toEqual(['2026-10', '2026-09']);

      const older = await get(
        members[0] as string,
        `/groups/${group.id}/billing/summary?period=2026-09`,
      ).expect(200);
      expect(older.body.period).toBe('2026-09');
      expect(older.body.rows).toHaveLength(1);
    });

    it('RF-002-16: un período sin ciclo responde 404 NOT_FOUND', async () => {
      const response = await get(
        titular,
        `/groups/${group.id}/billing/summary?period=2025-01`,
      ).expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('RF-002-16: un período mal formado responde 400', async () => {
      await get(titular, `/groups/${group.id}/billing/summary?period=2026-13`).expect(400);
    });

    it('CA-002-17: quien no es miembro, o ya se retiró, recibe 404 igual que un grupo inexistente', async () => {
      const stranger = await harness.insertUser();
      const left = members[3] as string;
      await harness.insertCharge(group, left);
      await harness.leaveGroup(group.id, left);

      for (const userId of [stranger, left]) {
        const response = await get(userId, `/groups/${group.id}/billing/summary`).expect(404);
        expect(response.body.code).toBe('NOT_FOUND');
      }
      await get(titular, '/groups/00000000-0000-4000-8000-000000000000/billing/summary').expect(
        404,
      );
      await get(titular, '/groups/no-es-uuid/billing/summary').expect(404);
    });

    it('RN-002-11: marca como ex miembro a quien ya salió del grupo', async () => {
      const left = members[3] as string;
      await harness.insertCharge(group, left, { status: 'atrasado' });
      await harness.leaveGroup(group.id, left);

      const response = await get(titular, `/groups/${group.id}/billing/summary`).expect(200);

      expect(response.body.rows).toEqual([
        expect.objectContaining({
          isFormerMember: true,
          charge: expect.objectContaining({
            member: expect.objectContaining({ isFormerMember: true }),
          }),
        }),
      ]);
    });

    it('RNF-002-01: sin sesión responde 401', async () => {
      await request(harness.app.getHttpServer())
        .get(`/groups/${group.id}/billing/summary`)
        .expect(401);
    });
  });

  describe('GET /groups/:groupId/charges', () => {
    it('CA-002-18: el historial muestra la línea de tiempo con evento, autor y fecha, sin motivos', async () => {
      const chargeId = await harness.insertCharge(group, members[0] as string);
      await insertEvent(chargeId, 'generado', null, '2026-10-15T04:00:00Z');
      await insertEvent(
        chargeId,
        'comprobante_subido',
        members[0] as string,
        '2026-10-16T10:00:00Z',
      );
      await insertEvent(
        chargeId,
        'rechazado',
        titular,
        '2026-10-16T11:00:00Z',
        'Comprobante borroso',
      );

      const response = await get(members[1] as string, `/groups/${group.id}/charges`).expect(200);

      expect(response.body.nextCursor).toBeNull();
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].timeline).toEqual([
        { type: 'generado', actor: null, occurredAt: '2026-10-15T04:00:00.000Z' },
        {
          type: 'comprobante_subido',
          actor: { userId: members[0], fullName: expect.any(String) },
          occurredAt: '2026-10-16T10:00:00.000Z',
        },
        {
          type: 'rechazado',
          actor: { userId: titular, fullName: 'Titular Suchas' },
          occurredAt: '2026-10-16T11:00:00.000Z',
        },
      ]);
      expect(JSON.stringify(response.body)).not.toContain('Comprobante borroso');
    });

    it('RNF-002-07: un miembro recibe ChargePublic sin comprobantes, referencias ni motivos', async () => {
      const chargeId = await harness.insertCharge(group, members[0] as string, {
        status: 'en_revision',
      });
      await harness.insertReceipt(chargeId, members[0] as string, { reference: 'REF-OCULTA-1' });

      const response = await get(members[1] as string, `/groups/${group.id}/charges`).expect(200);

      const [item] = response.body.items;
      expect(Object.keys(item).sort()).toEqual(
        [
          'amountCents',
          'dueAt',
          'groupId',
          'id',
          'member',
          'origin',
          'paidAt',
          'period',
          'status',
          'timeline',
        ].sort(),
      );
      expect(JSON.stringify(response.body)).not.toContain('REF-OCULTA-1');
    });

    it('CA-002-18: el titular recibe el Charge completo con motivos y comprobantes', async () => {
      const chargeId = await harness.insertCharge(group, members[0] as string, {
        status: 'en_revision',
      });
      await harness.insertReceipt(chargeId, members[0] as string, { reference: 'REF-TITULAR-7' });
      await insertEvent(chargeId, 'rechazado', titular, '2026-10-16T11:00:00Z', 'Falta el monto');

      const response = await get(titular, `/groups/${group.id}/charges`).expect(200);

      const [item] = response.body.items;
      expect(item).toMatchObject({
        id: chargeId,
        cycleId: group.cycleId,
        version: expect.any(Number),
        currentReceipt: expect.objectContaining({ reference: 'REF-TITULAR-7' }),
        lastRejection: expect.objectContaining({ reason: 'Falta el monto' }),
      });
      expect(item.timeline[0]).toMatchObject({ reason: 'Falta el monto' });
      expect(item.allowedActions).toEqual(['confirm', 'reject']);
    });

    it('RF-002-17: ordena por período y emisión descendentes y pagina con cursor sin repetir', async () => {
      const ids: string[] = [];
      for (const period of ['2026-08', '2026-09', '2026-10']) {
        for (const member of members.slice(0, 2)) {
          ids.push(await chargeIn(member as string, period));
        }
      }

      const first = await get(titular, `/groups/${group.id}/charges?limit=4`).expect(200);
      expect(first.body.items).toHaveLength(4);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await get(
        titular,
        `/groups/${group.id}/charges?limit=4&cursor=${first.body.nextCursor as string}`,
      ).expect(200);
      expect(second.body.items).toHaveLength(2);
      expect(second.body.nextCursor).toBeNull();

      const seen = [...first.body.items, ...second.body.items] as { id: string; period: string }[];
      expect(new Set(seen.map((c) => c.id)).size).toBe(6);
      expect(seen.map((c) => c.period)).toEqual([
        '2026-10',
        '2026-10',
        '2026-09',
        '2026-09',
        '2026-08',
        '2026-08',
      ]);
      expect(seen.map((c) => c.id).sort()).toEqual([...ids].sort());
    });

    it('RF-002-17: filtra por período, estado y persona', async () => {
      const a = await harness.insertCharge(group, members[0] as string);
      await harness.insertCharge(group, members[1] as string, { status: 'atrasado' });
      await harness.insertCharge(group, members[0] as string, {
        period: '2026-09',
        dueAt: '2026-09-19T04:00:00.000Z',
      });

      const byPeriod = await get(
        members[2] as string,
        `/groups/${group.id}/charges?period=2026-09`,
      );
      expect(byPeriod.body.items).toHaveLength(1);
      const byStatus = await get(
        members[2] as string,
        `/groups/${group.id}/charges?status=atrasado`,
      );
      expect(byStatus.body.items).toHaveLength(1);
      expect(byStatus.body.items[0].status).toBe('atrasado');
      const byUser = await get(
        members[2] as string,
        `/groups/${group.id}/charges?userId=${members[0] as string}&period=2026-10`,
      );
      expect(byUser.body.items.map((c: { id: string }) => c.id)).toEqual([a]);
    });

    it('RF-002-17: parámetros y cursor inválidos responden 400; un ajeno recibe 404', async () => {
      await get(titular, `/groups/${group.id}/charges?status=inventado`).expect(400);
      await get(titular, `/groups/${group.id}/charges?limit=0`).expect(400);
      await get(titular, `/groups/${group.id}/charges?userId=nope`).expect(400);
      const invalid = await get(titular, `/groups/${group.id}/charges?cursor=basura`).expect(400);
      expect(invalid.body.code).toBe('VALIDATION_ERROR');

      const stranger = await harness.insertUser();
      const response = await get(stranger, `/groups/${group.id}/charges`).expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('RF-002-17: el historial de un ex miembro con deuda sigue visible para el grupo', async () => {
      const left = members[3] as string;
      const chargeId = await harness.insertCharge(group, left, { status: 'atrasado' });
      await harness.leaveGroup(group.id, left);

      const response = await get(members[0] as string, `/groups/${group.id}/charges`).expect(200);

      expect(response.body.items[0]).toMatchObject({
        id: chargeId,
        status: 'atrasado',
        member: { userId: left, isFormerMember: true },
      });
    });
  });
});
