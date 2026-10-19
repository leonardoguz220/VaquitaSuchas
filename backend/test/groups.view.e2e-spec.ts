import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';

// Detalle del grupo (spec 001 T018/T019): cuota de referencia del titular y datos según el rol.
describe('Detalle del grupo', () => {
  const harness = new BillingHarness();
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url: string): request.Test =>
    http()
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-001-21: el titular de un grupo de 3 con Bs 90,00 ve 30,00 de referencia y no tiene cobro', async () => {
    const group = await harness.createGroup({ members: 2 });
    await harness.pool.query('UPDATE groups SET price_cents = 9000 WHERE id = $1', [group.id]);

    const detail = await get(group.ownerId, `/groups/${group.id}`).expect(200);
    expect(detail.body).toMatchObject({
      myRole: 'titular',
      myShareCents: 3000,
      breakdown: {
        totalBsCents: 9000,
        memberCount: 3,
        baseShareCents: 3000,
        ownerShareCents: 3000,
      },
    });

    const list = await get(group.ownerId, '/groups').expect(200);
    expect(list.body.items[0]).toMatchObject({ myShareCents: 3000, myShareIsReference: true });

    const charges = await harness.pool.query(
      'SELECT count(*) AS n FROM charges WHERE user_id = $1 AND group_id = $2',
      [group.ownerId, group.id],
    );
    expect(Number(charges.rows[0].n)).toBe(0);
  });

  it('RN-001-10: el centavo sobrante va al titular y el miembro ve su cuota base', async () => {
    const group = await harness.createGroup({ members: 2 });

    const owner = await get(group.ownerId, `/groups/${group.id}`).expect(200);
    const member = await get(group.memberIds[0] as string, `/groups/${group.id}`).expect(200);

    expect(owner.body.myShareCents).toBe(3335);
    expect(member.body).toMatchObject({ myRole: 'miembro', myShareCents: 3333 });
    expect(owner.body.breakdown.remainderCents).toBe(2);
  });

  it('RF-001-06: solo el titular recibe el código de invitación', async () => {
    const group = await harness.createGroup({ members: 1 });

    const owner = await get(group.ownerId, `/groups/${group.id}`).expect(200);
    const member = await get(group.memberIds[0] as string, `/groups/${group.id}`).expect(200);

    expect(owner.body.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(member.body).not.toHaveProperty('inviteCode');
  });

  it('RN-003-03: los miembros activos ven los celulares y los retirados no aparecen', async () => {
    const group = await harness.createGroup({ members: 2 });
    const [stay, gone] = group.memberIds as [string, string];
    await harness.leaveGroup(group.id, gone);

    const detail = await get(stay, `/groups/${group.id}`).expect(200);

    const ids = detail.body.members.map((m: { userId: string }) => m.userId);
    expect(ids).toEqual(expect.arrayContaining([group.ownerId, stay]));
    expect(ids).not.toContain(gone);
    for (const m of detail.body.members) expect(m.phone).toMatch(/^\+591/);
  });

  it('RF-001-12: el detalle trae la ventana de ingreso y frozenReason', async () => {
    const group = await harness.createGroup({ members: 1 });
    await harness.freezeGroup(group.id);

    const detail = await get(group.ownerId, `/groups/${group.id}`).expect(200);

    expect(detail.body.frozenReason).toBe('titular_baneado');
    expect(detail.body.entryWindow).toEqual(
      expect.objectContaining({ isOpen: expect.any(Boolean), acceptingMembers: true }),
    );
  });
});
