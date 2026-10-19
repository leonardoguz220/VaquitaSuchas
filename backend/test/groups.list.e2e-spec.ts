import request from 'supertest';
import { BillingHarness } from './support/billing-harness.js';

// «Mis suscripciones» (spec 001 T018/T019): GET /groups solo con los grupos de la persona.
describe('Mis suscripciones', () => {
  const harness = new BillingHarness();
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const get = (userId: string, url = '/groups'): request.Test =>
    http()
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  async function addMember(groupId: string, userId: string): Promise<void> {
    await harness.pool.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'miembro', 'creacion')`,
      [groupId, userId],
    );
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-001-20: ve solo sus grupos, con su rol y su cuota', async () => {
    const mine = await harness.createGroup({ members: 2, ownerName: 'Yo' });
    const other = await harness.createGroup({ members: 1 });
    await addMember(other.id, mine.ownerId);
    const stranger = await harness.createGroup({ members: 1 });

    const response = await get(mine.ownerId).expect(200);

    const ids = response.body.items.map((i: { id: string }) => i.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([mine.id, other.id]));
    expect(ids).not.toContain(stranger.id);
    const asOwner = response.body.items.find((i: { id: string }) => i.id === mine.id);
    const asMember = response.body.items.find((i: { id: string }) => i.id === other.id);
    expect(asOwner).toMatchObject({
      role: 'titular',
      memberCount: 3,
      totalSlots: 5,
      myShareCents: 3335,
      myShareIsReference: true,
      billingDay: 15,
      nextCutDate: '2026-11-15',
      status: 'activo',
      frozenReason: null,
    });
    expect(asMember).toMatchObject({
      role: 'miembro',
      myShareCents: 3333,
      myShareIsReference: false,
    });
    expect(response.body.nextCursor).toBeNull();
  });

  it('CA-001-20: filtra por rol y, por omisión, oculta los cerrados', async () => {
    const owned = await harness.createGroup({ members: 1 });
    const joined = await harness.createGroup({ members: 1 });
    await addMember(joined.id, owned.ownerId);
    const closed = await harness.createGroup({ members: 1 });
    await addMember(closed.id, owned.ownerId);
    await harness.pool.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1",
      [closed.id],
    );

    const titular = await get(owned.ownerId, '/groups?role=titular').expect(200);
    const miembro = await get(owned.ownerId, '/groups?role=miembro').expect(200);
    const cerrados = await get(owned.ownerId, '/groups?status=cerrado').expect(200);

    expect(titular.body.items.map((i: { id: string }) => i.id)).toEqual([owned.id]);
    expect(miembro.body.items.map((i: { id: string }) => i.id)).toEqual([joined.id]);
    expect(cerrados.body.items.map((i: { id: string }) => i.id)).toEqual([closed.id]);
  });

  it('CA-001-20: un exmiembro ya no ve el grupo y los parámetros inválidos dan 400', async () => {
    const group = await harness.createGroup({ members: 1 });
    const member = group.memberIds[0] as string;
    await harness.leaveGroup(group.id, member);

    const response = await get(member).expect(200);
    expect(response.body.items).toEqual([]);

    await get(member, '/groups?role=otro').expect(400);
    await get(member, '/groups?limit=0').expect(400);
    await get(member, '/groups?cursor=basura').expect(400);
    await http().get('/groups').expect(401);
  });

  it('RNF-001-05: con 50 grupos responde en menos de 500 ms y pagina con cursor', async () => {
    const viewer = await harness.insertUser('Con 50 grupos');
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const group = await harness.createGroup({ members: 0 });
      await addMember(group.id, viewer);
      ids.push(group.id);
    }

    const started = Date.now();
    const all = await get(viewer, '/groups?limit=100').expect(200);
    const elapsed = Date.now() - started;

    expect(all.body.items).toHaveLength(50);
    expect(elapsed).toBeLessThan(500);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: request.Response = await get(
        viewer,
        `/groups?limit=20${cursor ? `&cursor=${cursor}` : ''}`,
      ).expect(200);
      seen.push(...page.body.items.map((i: { id: string }) => i.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(50);
    expect([...seen].sort()).toEqual([...ids].sort());
  }, 60_000);
});
