import request from 'supertest';
import {
  CHARGE_FACTS_PORT,
  type ChargeFactsPort,
} from '../src/modules/billing/ports/charge-facts.port.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { pngBytes, uploadReceipt } from './support/receipt-files.js';

// Lectura de cobros (spec 002, US1, T017) contra PostgreSQL real: "Mis cobros", detalle, acciones
// permitidas, datos de pago y los hechos que lee la reputación.
describe('Lectura de cobros', () => {
  const harness = new BillingHarness();
  let group: TestGroup;
  let titular: string;
  let payer: string;
  let other: string;

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  /** El titular sube el QR del grupo por el endpoint real (spec 001, RF-001-20). */
  const uploadGroupQr = async (target: TestGroup): Promise<void> => {
    await request(harness.app.getHttpServer())
      .put(`/groups/${target.id}/payment-info`)
      .set('Authorization', `Bearer ${harness.token(target.ownerId)}`)
      .attach('qr', pngBytes(), { filename: 'qr.png' })
      .expect(200);
  };

  beforeAll(async () => {
    await harness.start();
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    group = await harness.createGroup({ members: 2, ownerName: 'Titular Suchas' });
    titular = group.ownerId;
    [payer, other] = group.memberIds as [string, string];
    harness.storage.files.clear();
  });

  it('RF-002-15: "Mis cobros" lista los del usuario con dueAt descendente y datos del grupo', async () => {
    const older = await harness.insertCharge(group, payer, {
      period: '2026-09',
      dueAt: '2026-10-17T04:00:00.000Z',
    });
    const newer = await harness.insertCharge(group, payer);

    const response = await get(payer, '/me/charges').expect(200);

    expect(response.body.nextCursor).toBeNull();
    expect(response.body.items.map((c: { id: string }) => c.id)).toEqual([newer, older]);
    expect(response.body.items[0]).toMatchObject({
      amountCents: 3333,
      status: 'pendiente',
      period: '2026-10',
      dueAt: '2026-10-19T04:00:00.000Z',
      group: { id: group.id, name: 'Grupo', serviceName: 'Servicio', logoUrl: null },
      allowedActions: ['uploadReceipt'],
      paymentInfo: { text: 'Transferir a la cuenta 123', qrUrl: null, configured: true },
    });
    expect(response.body.items[0]).not.toHaveProperty('receipts');
    expect(Number.isInteger(response.body.items[0].amountCents)).toBe(true);
  });

  it('RF-002-15: filtra por estado, período y grupo', async () => {
    const otherGroup = await harness.createGroup({ members: 1 });
    const pending = await harness.insertCharge(group, payer);
    const reviewing = await harness.insertCharge(group, payer, {
      period: '2026-09',
      status: 'en_revision',
      dueAt: '2026-09-19T04:00:00.000Z',
    });

    const byStatus = await get(payer, '/me/charges?status=en_revision').expect(200);
    expect(byStatus.body.items.map((c: { id: string }) => c.id)).toEqual([reviewing]);

    const byTwo = await get(payer, '/me/charges?status=pendiente&status=en_revision').expect(200);
    expect(byTwo.body.items).toHaveLength(2);
    const byCsv = await get(payer, '/me/charges?status=pendiente,en_revision').expect(200);
    expect(byCsv.body.items).toHaveLength(2);

    const byPeriod = await get(payer, '/me/charges?period=2026-10').expect(200);
    expect(byPeriod.body.items.map((c: { id: string }) => c.id)).toEqual([pending]);

    const byGroup = await get(payer, `/me/charges?groupId=${otherGroup.id}`).expect(200);
    expect(byGroup.body.items).toEqual([]);
  });

  it('RF-002-15: pagina con cursor sin repetir ni saltar cobros', async () => {
    const ids: string[] = [];
    // Los tres vencen después de NOW (2026-10-16): un cobro vencido lo barrería el sistema (R2).
    const periods: [string, string][] = [
      ['2026-10', '2026-10-19'],
      ['2026-09', '2026-10-18'],
      ['2026-08', '2026-10-17'],
    ];
    for (const [period, dueDay] of periods) {
      ids.push(
        await harness.insertCharge(group, payer, {
          period,
          dueAt: `${dueDay}T04:00:00.000Z`,
        }),
      );
    }

    const first = await get(payer, '/me/charges?limit=2').expect(200);
    expect(first.body.items.map((c: { id: string }) => c.id)).toEqual([ids[0], ids[1]]);
    expect(typeof first.body.nextCursor).toBe('string');

    const second = await get(
      payer,
      `/me/charges?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    ).expect(200);
    expect(second.body.items.map((c: { id: string }) => c.id)).toEqual([ids[2]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('RF-002-15: parámetros inválidos responden 400', async () => {
    await get(payer, '/me/charges?status=inventado').expect(400);
    await get(payer, '/me/charges?period=2026-13').expect(400);
    await get(payer, '/me/charges?limit=0').expect(400);
    await get(payer, '/me/charges?limit=999').expect(400);
    const badCursor = await get(payer, '/me/charges?cursor=basura').expect(400);
    expect(badCursor.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('CA-002-32: quien dejó el grupo ve solo sus cobros atrasados o en revisión', async () => {
    const late = await harness.insertCharge(group, other, { status: 'atrasado' });
    const reviewing = await harness.insertCharge(group, other, {
      period: '2026-09',
      status: 'en_revision',
      dueAt: '2026-09-19T04:00:00.000Z',
    });
    const pending = await harness.insertCharge(group, other, {
      period: '2026-08',
      dueAt: '2026-10-17T04:00:00.000Z',
    });
    await harness.leaveGroup(group.id, other, 'mora');

    const list = await get(other, '/me/charges').expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id).sort()).toEqual(
      [late, reviewing].sort(),
    );
    expect(list.body.items[0].member.isFormerMember).toBe(true);

    const detail = await get(other, `/charges/${late}`).expect(200);
    expect(detail.body).toMatchObject({
      status: 'atrasado',
      member: { userId: other, isFormerMember: true },
      allowedActions: ['uploadReceipt'],
    });
    // Un cobro que no es deuda ni está en revisión queda fuera: es "nada del grupo".
    await get(other, `/charges/${pending}`).expect(404);
  });

  it('CA-002-32: una persona que sigue en el grupo ve todos sus estados', async () => {
    await harness.insertCharge(group, payer, {
      period: '2026-08',
      dueAt: '2026-10-17T04:00:00.000Z',
    });
    const list = await get(payer, '/me/charges').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].member.isFormerMember).toBe(false);
  });

  it('RF-002-09: el dueño recibe los datos de pago con el QR firmado mientras el cobro admite pago', async () => {
    await uploadGroupQr(group);
    const chargeId = await harness.insertCharge(group, payer);

    const detail = await get(payer, `/charges/${chargeId}`).expect(200);
    expect(detail.body.paymentInfo.configured).toBe(true);
    expect(detail.body.paymentInfo.text).toBe('Transferir a la cuenta 123');
    expect(detail.body.paymentInfo.qrUrl).toContain('ttl=600');

    // Una vez en revisión ya no admite pago: no hay bloque de pago.
    await uploadReceipt(harness, payer, chargeId).expect(201);
    const reviewing = await get(payer, `/charges/${chargeId}`).expect(200);
    expect(reviewing.body.paymentInfo).toBeNull();
  });

  it('RF-002-09: si el grupo no configuró datos de pago, configured es false', async () => {
    await harness.pool.query('UPDATE groups SET payment_info_text = NULL WHERE id = $1', [
      group.id,
    ]);
    const chargeId = await harness.insertCharge(group, payer);
    const detail = await get(payer, `/charges/${chargeId}`).expect(200);
    expect(detail.body.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });
  });

  it('RF-002-09: si el almacén falla al firmar el QR, el detalle responde igual sin él', async () => {
    await uploadGroupQr(group);
    harness.storage.failSignedUrl = true;
    const chargeId = await harness.insertCharge(group, payer);
    try {
      const detail = await get(payer, `/charges/${chargeId}`).expect(200);
      expect(detail.body.paymentInfo).toMatchObject({ qrUrl: null, configured: true });
    } finally {
      harness.storage.failSignedUrl = false;
    }
  });

  it('RF-002-11: el dueño ve el motivo del último rechazo y la línea de tiempo con motivos', async () => {
    const chargeId = await harness.insertCharge(group, payer);
    await harness.pool.query(
      `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, from_status,
                                  to_status, reason, metadata, occurred_at)
       VALUES ($1, $2, 'rechazado', 'usuario', $3, 'en_revision', 'pendiente',
               'La imagen no se ve', '{"invalidReceipt": true}', $4)`,
      [chargeId, group.id, titular, '2026-10-16T16:00:00Z'],
    );

    const detail = await get(payer, `/charges/${chargeId}`).expect(200);

    expect(detail.body.lastRejection).toEqual({
      reason: 'La imagen no se ve',
      invalidReceipt: true,
      at: '2026-10-16T16:00:00.000Z',
    });
    expect(detail.body.timeline[0]).toMatchObject({
      type: 'rechazado',
      reason: 'La imagen no se ve',
      actor: { userId: titular, fullName: 'Titular Suchas' },
    });
  });

  it('RF-002-05: en un grupo congelado el detalle es de solo lectura (sin acciones)', async () => {
    const chargeId = await harness.insertCharge(group, payer);
    await harness.freezeGroup(group.id);
    const asPayer = await get(payer, `/charges/${chargeId}`).expect(200);
    expect(asPayer.body.allowedActions).toEqual([]);
    const asTitular = await get(titular, `/charges/${chargeId}`).expect(200);
    expect(asTitular.body.allowedActions).toEqual([]);
  });

  it('RF-002-12: el titular ve las acciones que le corresponden según el estado', async () => {
    const pending = await harness.insertCharge(group, payer);
    const asTitular = await get(titular, `/charges/${pending}`).expect(200);
    expect(asTitular.body.allowedActions).toEqual(['manualPayment', 'cancel']);
  });

  describe('ChargeFactsPort (spec 007)', () => {
    const facts = (
      userIds: string[],
      since: Date,
    ): Promise<Awaited<ReturnType<ChargeFactsPort['listForUsers']>>> =>
      harness.app
        .get<ChargeFactsPort>(CHARGE_FACTS_PORT)
        .listForUsers(harness.app.get(DbService), userIds, since);

    it('RN-002-08: entrega la primera y la última subida y la fecha de puntualidad', async () => {
      const chargeId = await harness.insertCharge(group, payer);
      const first = harness.clock.now();
      await uploadReceipt(harness, payer, chargeId, { reference: 'F-1' }).expect(201);
      harness.clock.advance(60_000);
      await uploadReceipt(harness, payer, chargeId, { reference: 'F-2' }).expect(201);
      const last = harness.clock.now();

      const [fact] = await facts([payer], new Date('2026-01-01T00:00:00Z'));

      expect(fact).toMatchObject({
        chargeId,
        userId: payer,
        groupId: group.id,
        status: 'en_revision',
        origin: 'ciclo',
        hadInvalidReceiptRejection: false,
        groupFrozenByBan: false,
        firstSubmittedAt: first,
        lastSubmittedAt: last,
        punctualityAt: first,
      });
    });

    it('RF-007-12: tras un rechazo «comprobante inválido» la puntualidad usa la última subida', async () => {
      const chargeId = await harness.insertCharge(group, payer);
      await uploadReceipt(harness, payer, chargeId, { reference: 'I-1' }).expect(201);
      harness.clock.advance(60_000);
      await uploadReceipt(harness, payer, chargeId, { reference: 'I-2' }).expect(201);
      const last = harness.clock.now();
      await harness.pool.query(
        `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, reason, metadata, occurred_at)
         VALUES ($1, $2, 'rechazado', 'usuario', $3, 'Falso', '{"invalidReceipt": true}', now())`,
        [chargeId, group.id, titular],
      );

      const [fact] = await facts([payer], new Date('2026-01-01T00:00:00Z'));

      expect(fact?.hadInvalidReceiptRejection).toBe(true);
      expect(fact?.punctualityAt).toEqual(last);
    });

    it('RF-007-12: un rechazo sin «comprobante inválido» no mueve la puntualidad', async () => {
      const chargeId = await harness.insertCharge(group, payer);
      const first = harness.clock.now();
      await uploadReceipt(harness, payer, chargeId, { reference: 'N-1' }).expect(201);
      await harness.pool.query(
        `INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, reason, metadata, occurred_at)
         VALUES ($1, $2, 'rechazado', 'usuario', $3, 'Borroso', '{}', now())`,
        [chargeId, group.id, titular],
      );
      const [fact] = await facts([payer], new Date('2026-01-01T00:00:00Z'));
      expect(fact?.hadInvalidReceiptRejection).toBe(false);
      expect(fact?.punctualityAt).toEqual(first);
    });

    it('RF-007-12: un cobro sin subidas no tiene fecha de puntualidad y respeta la ventana y el baneo', async () => {
      const chargeId = await harness.insertCharge(group, other);
      await harness.freezeGroup(group.id);

      const [fact] = await facts([other], new Date('2026-01-01T00:00:00Z'));
      expect(fact).toMatchObject({
        chargeId,
        firstSubmittedAt: null,
        lastSubmittedAt: null,
        punctualityAt: null,
        groupFrozenByBan: true,
      });
      expect(await facts([other], new Date('2027-01-01T00:00:00Z'))).toEqual([]);
      expect(await facts([], new Date('2026-01-01T00:00:00Z'))).toEqual([]);
    });
  });
});
