import request from 'supertest';
import { ChargesRepository } from '../src/modules/billing/repositories/charges.repository.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { uploadReceipt } from './support/receipt-files.js';

// Revisión del titular (spec 002, US3 y US4, T024/T028) contra PostgreSQL real: confirmar,
// rechazar, pago manual y cancelación.
describe('Revisión de pagos del titular', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let ownerId: string;
  let memberA: string;
  let memberB: string;
  let seq = 0;

  const post = (
    userId: string,
    chargeId: string,
    action: string,
    body: object = {},
  ): request.Test =>
    request(harness.app.getHttpServer())
      .post(`/charges/${chargeId}/${action}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);

  const row = async (
    id: string,
  ): Promise<{ status: string; settlement: string | null; paid_at: Date | null }> =>
    (
      await harness.pool.query(
        'SELECT status, settlement, paid_at, manual_note, cancel_reason, cancelled_by FROM charges WHERE id = $1',
        [id],
      )
    ).rows[0];

  const receiptStatuses = async (chargeId: string): Promise<string[]> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM receipts WHERE charge_id = $1 ORDER BY uploaded_at',
        [chargeId],
      )
    ).rows.map((r) => r.status);

  const eventTypes = async (chargeId: string): Promise<string[]> =>
    (
      await harness.pool.query<{ type: string }>(
        'SELECT type FROM charge_events WHERE charge_id = $1 ORDER BY type',
        [chargeId],
      )
    ).rows.map((r) => r.type);

  /** Cobro `en_revision` creado como lo hace el miembro: subiendo un comprobante por HTTP. */
  async function submitted(user: string, reference: string): Promise<string> {
    seq += 1;
    const chargeId = await harness.insertCharge(group, user, {
      period: `${2027 + Math.floor((seq - 1) / 12)}-${String(((seq - 1) % 12) + 1).padStart(2, '0')}`,
      dueAt: '2099-01-01T04:00:00Z',
    });
    await uploadReceipt(harness, user, chargeId, { reference }).expect(201);
    return chargeId;
  }

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2 });
    ownerId = group.ownerId;
    [memberA, memberB] = group.memberIds as [string, string];
  });

  it('CA-002-06: el titular confirma un cobro en revisión y queda pagado', async () => {
    const chargeId = await submitted(memberA, 'TX-100');

    const response = await post(ownerId, chargeId, 'confirm').expect(200);

    expect(response.body).toMatchObject({
      status: 'pagado',
      settlement: 'comprobante',
      paidAt: NOW,
      settledBy: { userId: ownerId },
      allowedActions: [],
    });
    expect(await receiptStatuses(chargeId)).toEqual(['confirmado']);
    expect(await eventTypes(chargeId)).toEqual(['comprobante_subido', 'confirmado'].sort());
    // La referencia confirmada sigue reservada (RN-010-14).
    const other = await harness.insertCharge(group, memberB);
    await uploadReceipt(harness, memberB, other, { reference: 'tx-100' }).expect(409);
  });

  it('CA-002-06: un cobro que no está en revisión no se confirma', async () => {
    const chargeId = await harness.insertCharge(group, memberA);
    const response = await post(ownerId, chargeId, 'confirm').expect(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'pendiente', action: 'confirm' },
    });
  });

  it('CA-002-07: rechazar antes del vencimiento vuelve a pendiente, con motivo y referencia libre', async () => {
    const chargeId = await submitted(memberA, 'TX-200');

    const response = await post(ownerId, chargeId, 'reject', {
      reason: 'El monto no coincide',
      invalidReceipt: true,
    }).expect(200);

    expect(response.body).toMatchObject({
      status: 'pendiente',
      lastRejection: { reason: 'El monto no coincide', invalidReceipt: true },
      allowedActions: ['manualPayment', 'cancel'],
    });
    expect(await receiptStatuses(chargeId)).toEqual(['rechazado']);
    expect(await eventTypes(chargeId)).toEqual(['comprobante_subido', 'rechazado'].sort());
    // La referencia quedó libre: otro miembro puede usarla.
    const other = await harness.insertCharge(group, memberB);
    await uploadReceipt(harness, memberB, other, { reference: 'TX-200' }).expect(201);
  });

  it('CA-002-07: con invalidReceipt false el rechazo se registra como no inválido y el miembro puede volver a subir', async () => {
    const chargeId = await submitted(memberA, 'TX-210');
    const response = await post(ownerId, chargeId, 'reject', {
      reason: 'Foto borrosa',
      invalidReceipt: false,
    }).expect(200);
    expect(response.body.lastRejection).toMatchObject({ invalidReceipt: false });
    await uploadReceipt(harness, memberA, chargeId, { reference: 'TX-211' }).expect(201);
  });

  it('CA-002-30: rechazar un cobro ya vencido lo deja atrasado, sin retirar al miembro', async () => {
    const chargeId = await harness.insertCharge(group, memberA, {
      status: 'en_revision',
      dueAt: '2026-10-16T10:00:00.000Z', // anterior a NOW
    });
    await harness.insertReceipt(chargeId, memberA, { reference: 'TX-300' });

    const response = await post(ownerId, chargeId, 'reject', {
      reason: 'Comprobante ilegible',
      invalidReceipt: false,
    }).expect(200);

    expect(response.body.status).toBe('atrasado');
    const member = await harness.pool.query(
      'SELECT left_at FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, memberA],
    );
    expect(member.rows[0].left_at).toBeNull();
    expect(await eventTypes(chargeId)).toEqual(['rechazado']);
  });

  it.each([
    ['sin motivo', { invalidReceipt: false }],
    ['sin invalidReceipt', { reason: 'Motivo válido' }],
    ['motivo vacío', { reason: '   ', invalidReceipt: false }],
    ['motivo de 4 caracteres', { reason: 'nope', invalidReceipt: false }],
    ['motivo de 201 caracteres', { reason: 'x'.repeat(201), invalidReceipt: false }],
    ['invalidReceipt que no es booleano', { reason: 'Motivo válido', invalidReceipt: 'si' }],
  ])('CA-002-08: el rechazo %s responde 400 y no cambia nada', async (_name, body) => {
    const chargeId = await submitted(memberA, `TX-${Math.random().toString(36).slice(2, 8)}`);
    const response = await post(ownerId, chargeId, 'reject', body).expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await row(chargeId)).status).toBe('en_revision');
    expect(await receiptStatuses(chargeId)).toEqual(['vigente']);
  });

  it('CA-002-08: un motivo de 5 y uno de 200 caracteres sí valen', async () => {
    const a = await submitted(memberA, 'TX-801');
    await post(ownerId, a, 'reject', { reason: 'abcde', invalidReceipt: false }).expect(200);
    const b = await submitted(memberB, 'TX-802');
    await post(ownerId, b, 'reject', { reason: 'x'.repeat(200), invalidReceipt: false }).expect(
      200,
    );
  });

  it('CA-002-11: un cobro pagado no admite confirmar, rechazar, pago manual ni cancelar', async () => {
    const chargeId = await submitted(memberA, 'TX-400');
    await post(ownerId, chargeId, 'confirm').expect(200);

    for (const [action, body] of [
      ['confirm', {}],
      ['reject', { reason: 'Ya no importa', invalidReceipt: false }],
      ['manual-payment', {}],
      ['cancel', { reason: 'Ya no importa' }],
    ] as const) {
      const response = await post(ownerId, chargeId, action, body).expect(409);
      expect(response.body).toMatchObject({
        code: 'INVALID_TRANSITION',
        details: { from: 'pagado' },
      });
    }
    expect((await row(chargeId)).status).toBe('pagado');
  });

  it('CA-002-11: un cobro cancelado tampoco admite cambios', async () => {
    const chargeId = await harness.insertCharge(group, memberA, { status: 'atrasado' });
    await post(ownerId, chargeId, 'cancel', { reason: 'Se salió del grupo' }).expect(200);
    const response = await post(ownerId, chargeId, 'manual-payment').expect(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'cancelado' },
    });
  });

  it('CA-002-12: el dueño del cobro no confirma ni rechaza el suyo (403) y otro miembro tampoco', async () => {
    const chargeId = await submitted(memberA, 'TX-500');
    for (const user of [memberA, memberB]) {
      await post(user, chargeId, 'confirm').expect(403);
      await post(user, chargeId, 'reject', {
        reason: 'Motivo válido',
        invalidReceipt: false,
      }).expect(403);
      await post(user, chargeId, 'manual-payment').expect(403);
      await post(user, chargeId, 'cancel', { reason: 'Motivo válido' }).expect(403);
    }
    expect((await row(chargeId)).status).toBe('en_revision');
  });

  it('CA-002-23: una persona ajena al grupo recibe 404 al confirmar', async () => {
    const chargeId = await submitted(memberA, 'TX-501');
    const stranger = await harness.insertUser();
    await post(stranger, chargeId, 'confirm').expect(404);
  });

  it('CA-002-19: una versión desactualizada responde 409 STALE_STATE', async () => {
    const chargeId = await submitted(memberA, 'TX-600');
    const response = await post(ownerId, chargeId, 'confirm', { version: 1 }).expect(409);
    expect(response.body).toMatchObject({ code: 'STALE_STATE' });
    expect((await row(chargeId)).status).toBe('en_revision');
  });

  it('RN-002-09: un grupo congelado rechaza toda acción con 422 GROUP_FROZEN', async () => {
    const chargeId = await submitted(memberA, 'TX-700');
    await harness.freezeGroup(group.id);
    const response = await post(ownerId, chargeId, 'confirm').expect(422);
    expect(response.body).toMatchObject({ code: 'GROUP_FROZEN' });
    await post(ownerId, chargeId, 'reject', {
      reason: 'Motivo válido',
      invalidReceipt: false,
    }).expect(422);
  });

  it('research R5: un grupo cerrado sigue permitiendo confirmar cobros existentes', async () => {
    const chargeId = await submitted(memberA, 'TX-710');
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1",
      [group.id],
    );
    await post(ownerId, chargeId, 'confirm').expect(200);
  });

  describe('pago manual y cancelación (T028)', () => {
    it('CA-002-14: pago manual de un cobro pendiente con fecha y nota', async () => {
      const chargeId = await harness.insertCharge(group, memberA);
      const paidAt = '2026-10-16T01:00:00.000Z';

      const response = await post(ownerId, chargeId, 'manual-payment', {
        paidAt,
        note: 'Pagó en efectivo',
      }).expect(200);

      expect(response.body).toMatchObject({
        status: 'pagado',
        settlement: 'manual',
        paidAt,
        manualNote: 'Pagó en efectivo',
        settledBy: { userId: ownerId },
      });
      expect(await eventTypes(chargeId)).toEqual(['pago_manual']);
    });

    it('CA-002-14: sin fecha usa ahora y vale para un cobro atrasado', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { status: 'atrasado' });
      const response = await post(ownerId, chargeId, 'manual-payment').expect(200);
      expect(response.body).toMatchObject({ status: 'pagado', settlement: 'manual', paidAt: NOW });
    });

    it.each([
      ['anterior a la emisión', { paidAt: '2026-10-14T00:00:00.000Z' }],
      ['en el futuro', { paidAt: '2026-10-20T00:00:00.000Z' }],
      ['con formato inválido', { paidAt: 'ayer' }],
      ['con una nota de 201 caracteres', { note: 'x'.repeat(201) }],
    ])('CA-002-14: un pago manual %s responde 400', async (_name, body) => {
      const chargeId = await harness.insertCharge(group, memberA);
      const response = await post(ownerId, chargeId, 'manual-payment', body).expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect((await row(chargeId)).status).toBe('pendiente');
    });

    it('CA-002-14: una nota de 200 caracteres vale; en revisión no admite pago manual', async () => {
      const a = await harness.insertCharge(group, memberA);
      await post(ownerId, a, 'manual-payment', { note: 'x'.repeat(200) }).expect(200);
      const b = await harness.insertCharge(group, memberB, { status: 'en_revision' });
      const response = await post(ownerId, b, 'manual-payment').expect(409);
      expect(response.body).toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('CA-002-15: cancelar un cobro atrasado con motivo; ya no cuenta como deuda', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { status: 'atrasado' });
      const charges = harness.app.get(ChargesRepository);
      const db = harness.app.get(DbService);
      expect(await charges.hasOverdue(db, memberA)).toBe(true);

      const response = await post(ownerId, chargeId, 'cancel', { reason: 'Dejó el grupo' }).expect(
        200,
      );

      expect(response.body).toMatchObject({
        status: 'cancelado',
        cancelReason: 'Dejó el grupo',
        allowedActions: [],
      });
      expect(await charges.hasOverdue(db, memberA)).toBe(false);
      expect(await eventTypes(chargeId)).toEqual(['cancelado']);
      expect((await row(chargeId)) as unknown).toMatchObject({ cancelled_by: ownerId });
    });

    it.each([
      ['sin motivo', {}],
      ['con motivo de 4 caracteres', { reason: 'nope' }],
      ['con motivo de 201 caracteres', { reason: 'x'.repeat(201) }],
    ])('CA-002-15: cancelar %s responde 400', async (_name, body) => {
      const chargeId = await harness.insertCharge(group, memberA, { status: 'atrasado' });
      await post(ownerId, chargeId, 'cancel', body).expect(400);
      expect((await row(chargeId)).status).toBe('atrasado');
    });

    it('CA-002-15: un cobro en revisión no se cancela', async () => {
      const chargeId = await harness.insertCharge(group, memberA, { status: 'en_revision' });
      const response = await post(ownerId, chargeId, 'cancel', { reason: 'Motivo válido' }).expect(
        409,
      );
      expect(response.body).toMatchObject({ code: 'INVALID_TRANSITION' });
    });
  });
});
