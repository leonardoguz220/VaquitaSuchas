import request from 'supertest';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { pngBytes } from './support/receipt-files.js';

// Detalle del grupo (spec 001 T018/T019): GET /groups/:id contra PostgreSQL real.
describe('Detalle de grupos', () => {
  const harness = new BillingHarness();
  let group: TestGroup;

  const get = (userId: string, groupId: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const phoneOf = async (userId: string): Promise<string> =>
    (
      await harness.pool.query<{ phone_e164: string }>(
        'SELECT phone_e164 FROM users WHERE id = $1',
        [userId],
      )
    ).rows[0]?.phone_e164 as string;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    // Titular + 2 miembros = 3, a Bs 90,00.
    group = await harness.createGroup({ members: 2, ownerName: 'Titular Prueba' });
    await harness.pool.query('UPDATE groups SET price_cents = 9000 WHERE id = $1', [group.id]);
    harness.storage.files.clear();
    harness.storage.failSignedUrl = false;
  });

  it('CA-001-21 y RN-001-10: el titular de 3 miembros a Bs 90,00 ve 30,00 de referencia y no se le genera cobro', async () => {
    const response = await get(group.ownerId, group.id).expect(200);

    expect(response.body).toMatchObject({
      id: group.id,
      myRole: 'titular',
      myShareCents: 3000,
      breakdown: {
        memberCount: 3,
        totalBsCents: 9000,
        baseShareCents: 3000,
        ownerShareCents: 3000,
        remainderCents: 0,
      },
    });

    // Al generar el siguiente ciclo, los miembros reciben su cobro y el titular ninguno.
    const cycles = harness.app.get(BillingCyclesService, { strict: false });
    const db = harness.app.get(DbService, { strict: false });
    await db.withTransaction((tx) =>
      cycles.ensureCurrentCycle(tx, group.id, new Date('2026-11-16T15:00:00.000Z')),
    );
    const owned = await harness.pool.query(
      `SELECT 1 FROM charges WHERE group_id = $1 AND user_id = $2 AND period = '2026-11'`,
      [group.id, group.ownerId],
    );
    expect(owned.rowCount).toBe(0);
    const members = await harness.pool.query<{ amount_cents: string }>(
      `SELECT amount_cents::text FROM charges WHERE group_id = $1 AND period = '2026-11'`,
      [group.id],
    );
    expect(members.rows.map((r) => r.amount_cents)).toEqual(['3000', '3000']);
  });

  it('RF-001-13: el miembro ve su cuota base y el desglose; el resto de centavos es del titular', async () => {
    await harness.pool.query('UPDATE groups SET price_cents = 10001 WHERE id = $1', [group.id]);
    const [member] = group.memberIds as [string];

    const asMember = await get(member, group.id).expect(200);
    expect(asMember.body).toMatchObject({
      myRole: 'miembro',
      myShareCents: 3333,
      breakdown: { baseShareCents: 3333, ownerShareCents: 3335, remainderCents: 2 },
    });
    const asOwner = await get(group.ownerId, group.id).expect(200);
    expect(asOwner.body.myShareCents).toBe(3335);
  });

  it('RF-001-06: el código de invitación lo ve solo el titular', async () => {
    const [member] = group.memberIds as [string];
    const asOwner = await get(group.ownerId, group.id).expect(200);
    expect(asOwner.body.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    const asMember = await get(member, group.id).expect(200);
    expect(asMember.body).not.toHaveProperty('inviteCode');
  });

  it('RN-003-03: los miembros activos se ven el celular entre sí; el correo y la CI no se exponen', async () => {
    const [first, second] = group.memberIds as [string, string];
    const asMember = await get(first, group.id).expect(200);
    const phones = Object.fromEntries(
      asMember.body.members.map((m: { userId: string; phone: string }) => [m.userId, m.phone]),
    );
    expect(phones[group.ownerId]).toBe(await phoneOf(group.ownerId));
    expect(phones[second]).toBe(await phoneOf(second));
    expect(asMember.body.members[0]).toMatchObject({ role: 'titular', fullName: 'Titular Prueba' });
    expect(Object.keys(asMember.body.members[0]).sort()).toEqual(
      ['fullName', 'joinedAt', 'phone', 'role', 'userId'].sort(),
    );
    expect(JSON.stringify(asMember.body)).not.toMatch(/@example\.test|ci_|password/);
  });

  it('RN-003-03: quien dejó el grupo ya no lo ve ni aparece en la lista de miembros', async () => {
    const [leaver] = group.memberIds as [string];
    await harness.leaveGroup(group.id, leaver);

    await get(leaver, group.id).expect(404);
    const asOwner = await get(group.ownerId, group.id).expect(200);
    expect(asOwner.body.members.map((m: { userId: string }) => m.userId)).not.toContain(leaver);
    expect(asOwner.body.breakdown.memberCount).toBe(2);
  });

  it('RF-001-22 y CA-001-26: devuelve la ventana de ingreso y si recibe miembros', async () => {
    const response = await get(group.ownerId, group.id).expect(200);
    // Corte el 15: como en CA-001-26 (corte el 10, abierta hasta el 13 a las 23:59:59) cierra el 18 a las 23:59:59 de La Paz.
    expect(response.body.entryWindow).toEqual({
      isOpen: true,
      opensAt: null,
      closesAt: '2026-10-19T03:59:59.000Z',
      acceptingMembers: true,
    });
    expect(Date.parse(response.body.entryWindow.closesAt)).toBeGreaterThan(Date.parse(NOW));
  });

  it('RF-009-22: expone frozenReason cuando el titular fue baneado', async () => {
    const before = await get(group.ownerId, group.id).expect(200);
    expect(before.body.frozenReason).toBeNull();
    await harness.freezeGroup(group.id);
    const after = await get(group.ownerId, group.id).expect(200);
    expect(after.body.frozenReason).toBe('titular_baneado');
  });

  it('CA-001-23: los datos de pago incluyen el QR firmado de 10 minutos que sube el titular', async () => {
    const [member] = group.memberIds as [string];
    await request(harness.app.getHttpServer())
      .put(`/groups/${group.id}/payment-info`)
      .set('Authorization', `Bearer ${harness.token(group.ownerId)}`)
      .field('text', 'Banco X')
      .attach('qr', pngBytes(), { filename: 'qr.png' })
      .expect(200);

    const response = await get(member, group.id).expect(200);
    expect(response.body.paymentInfo).toMatchObject({ text: 'Banco X', configured: true });
    expect(response.body.paymentInfo.qrUrl).toContain('ttl=600');
  });

  it('RF-001-13: incluye el servicio del grupo y el contrato completo del detalle', async () => {
    const response = await get(group.ownerId, group.id).expect(200);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'billingDay',
        'breakdown',
        'createdAt',
        'currency',
        'entryWindow',
        'exchangeRate',
        'frozenReason',
        'id',
        'inviteCode',
        'members',
        'myRole',
        'myShareCents',
        'name',
        'paymentInfo',
        'priceCents',
        'service',
        'status',
        'totalSlots',
        'version',
      ].sort(),
    );
    expect(response.body.service).toMatchObject({ name: 'Servicio', isCustom: true });
  });
});
