import request from 'supertest';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { insertOwnedGroup } from './support/groups-fixtures.js';

// «Mis suscripciones» (spec 001 T018): GET /groups contra PostgreSQL real.
describe('Listar mis grupos', () => {
  const harness = new BillingHarness();

  const list = (userId: string, query = ''): request.Test =>
    request(harness.app.getHttpServer())
      .get(`/groups${query}`)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  const join = async (groupId: string, userId: string): Promise<void> => {
    await harness.pool.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'miembro', 'creacion')`,
      [groupId, userId],
    );
  };

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-001-20: ve solo sus grupos, con su rol y su cuota', async () => {
    const mine: TestGroup = await harness.createGroup({ members: 2 }); // titular + 2
    const other = await harness.createGroup({ members: 1 });
    const member = mine.memberIds[0] as string;
    const memberOfBoth = other.memberIds[0] as string;
    await join(mine.id, memberOfBoth);

    const asMember = await list(member).expect(200);
    expect(asMember.body.nextCursor).toBeNull();
    expect(asMember.body.items).toHaveLength(1);
    expect(asMember.body.items[0]).toMatchObject({
      id: mine.id,
      role: 'miembro',
      status: 'activo',
      frozenReason: null,
      memberCount: 4, // titular, 2 miembros y la persona que se unió después
      totalSlots: 5,
      myShareCents: 2500,
      myShareIsReference: false,
      billingDay: 15,
      serviceName: 'Servicio',
      nextCutDate: '2026-11-15',
    });

    const asBoth = await list(memberOfBoth).expect(200);
    expect(asBoth.body.items.map((g: { id: string }) => g.id).sort()).toEqual(
      [mine.id, other.id].sort(),
    );
    const noGroups = await list(await harness.insertUser()).expect(200);
    expect(noGroups.body).toEqual({ items: [], nextCursor: null });
    await request(harness.app.getHttpServer()).get('/groups').expect(401);
  });

  it('CA-001-21 y RN-001-10: el titular ve su cuota como referencia', async () => {
    const group = await harness.createGroup({ members: 2 });
    await harness.pool.query('UPDATE groups SET price_cents = 9000 WHERE id = $1', [group.id]);
    const response = await list(group.ownerId).expect(200);
    expect(response.body.items[0]).toMatchObject({
      role: 'titular',
      myShareCents: 3000,
      myShareIsReference: true,
    });
  });

  it('RF-001-19: filtra por rol y por estado; los cerrados solo aparecen con status=cerrado', async () => {
    const user = await harness.insertUser();
    const owned = await insertOwnedGroup(harness, user);
    const closed = await insertOwnedGroup(harness, user);
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [closed],
    );
    const joined = await harness.createGroup({ members: 0 });
    await join(joined.id, user);

    const all = await list(user).expect(200);
    expect(all.body.items.map((g: { id: string }) => g.id).sort()).toEqual(
      [owned, closed, joined.id].sort(),
    );
    const active = await list(user, '?status=activo').expect(200);
    expect(active.body.items.map((g: { id: string }) => g.id).sort()).toEqual(
      [owned, joined.id].sort(),
    );
    const onlyClosed = await list(user, '?status=cerrado').expect(200);
    expect(onlyClosed.body.items).toHaveLength(1);
    expect(onlyClosed.body.items[0]).toMatchObject({ id: closed, status: 'cerrado' });
    const asMember = await list(user, '?role=miembro').expect(200);
    expect(asMember.body.items.map((g: { id: string }) => g.id)).toEqual([joined.id]);
    const asOwner = await list(user, '?role=titular&status=activo').expect(200);
    expect(asOwner.body.items.map((g: { id: string }) => g.id)).toEqual([owned]);
    await list(user, '?role=otro').expect(400);
    await list(user, '?status=raro').expect(400);
  });

  it('RF-001-19: quien dejó un grupo ya no lo lista', async () => {
    const group = await harness.createGroup({ members: 1 });
    const member = group.memberIds[0] as string;
    await harness.leaveGroup(group.id, member);
    expect((await list(member).expect(200)).body.items).toEqual([]);
  });

  it('RF-009-22: un grupo congelado lista su frozenReason', async () => {
    const group = await harness.createGroup({ members: 1 });
    await harness.freezeGroup(group.id);
    const response = await list(group.ownerId).expect(200);
    expect(response.body.items[0].frozenReason).toBe('titular_baneado');
  });

  it('CA-001-20 y RNF-001-05: con 50 grupos pagina sin repetir y cada página responde en menos de 500 ms', async () => {
    const user = await harness.insertUser();
    const ids: string[] = [];
    // Un titular activo tiene como máximo 5 grupos (RN-001-14): 5 propios y 45 como miembro.
    for (let i = 0; i < 5; i++) ids.push(await insertOwnedGroup(harness, user));
    for (let owner = 0; owner < 9; owner++) {
      const ownerId = await harness.insertUser();
      for (let i = 0; i < 5; i++) {
        const id = await insertOwnedGroup(harness, ownerId);
        await join(id, user);
        ids.push(id);
      }
    }
    expect(ids).toHaveLength(50);

    const started = Date.now();
    const big = await list(user, '?limit=100').expect(200);
    expect(Date.now() - started).toBeLessThan(500);
    expect(big.body.items).toHaveLength(50);
    expect(big.body.nextCursor).toBeNull();

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response: request.Response = await list(
        user,
        `?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ).expect(200);
      seen.push(...response.body.items.map((g: { id: string }) => g.id));
      cursor = response.body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(50);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it('RF-001-19: un cursor mal formado o un límite fuera de rango dan 400', async () => {
    const user = await harness.insertUser();
    const bad = await list(user, '?cursor=basura').expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    await list(user, '?limit=0').expect(400);
    await list(user, '?limit=101').expect(400);
  });
});
