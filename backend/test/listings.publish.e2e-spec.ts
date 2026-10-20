import request from 'supertest';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { ListingsService } from '../src/modules/listings/services/listings.service.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';
import { seedRequest } from './support/join-requests-fixtures.js';

const DAY_MS = 24 * 3600_000;
const plus30 = new Date(Date.parse(NOW) + 30 * DAY_MS).toISOString();

// Publicación del titular (spec 008 US1, T009/T010) contra PostgreSQL real.
describe('Publicación de cupos libres del grupo', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const call = (method: 'get' | 'post' | 'patch' | 'delete', userId: string, url: string) =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const url = (group: Pick<TestGroup, 'id'>, suffix = ''): string =>
    `/groups/${group.id}/listing${suffix}`;
  const publish = (userId: string, group: Pick<TestGroup, 'id'>, body: object) =>
    call('post', userId, url(group)).send(body);
  const listingRow = async (groupId: string) =>
    (
      await harness.pool.query<{
        status: string;
        slots_offered: number;
        end_reason: string | null;
        expires_at: Date;
        version: number;
      }>(
        `SELECT status, slots_offered, end_reason, expires_at, version FROM listings
          WHERE group_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [groupId],
      )
    ).rows[0];

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  it('CA-008-01: el titular publica 2 cupos; vence en 30 días y aparece con la cuota estimada', async () => {
    const group = await harness.createGroup({ members: 1 }); // 2 de 5: 3 libres; Bs 100,01
    const response = await publish(group.ownerId, group, {
      slotsOffered: 2,
      description: '  Cupo en Premium  ',
      conditions: 'Pago\r\npuntual',
    }).expect(201);

    expect(response.body).toMatchObject({
      groupId: group.id,
      status: 'activa',
      slotsOffered: 2,
      description: 'Cupo en Premium',
      conditions: 'Pago\npuntual',
      expiresAt: plus30,
      renewedAt: null,
      reportCount: 0,
      openRequests: 0,
      version: 1,
    });
    // Bs 100,01 / (2 miembros + 2 cupos) = Bs 25,00 estimada (RN-008-02).
    expect(response.body.preview).toMatchObject({
      slotsOffered: 2,
      estimatedShareCents: 2500,
      estimatedShareLabel: 'estimada',
    });
    const viewer = await harness.insertUser();
    const found = await call('get', viewer, '/listings').expect(200);
    const item = found.body.items.find((i: { id: string }) => i.id === response.body.id);
    expect(item.estimatedShareCents).toBe(2500);
  });

  it('CA-008-02: un grupo lleno no puede publicar', async () => {
    const full = await harness.createGroup({ members: 4 }); // 5 de 5
    const response = await publish(full.ownerId, full, { slotsOffered: 1 }).expect(422);
    expect(response.body.code).toBe('NO_FREE_SLOTS');
    expect(await listingRow(full.id)).toBeUndefined();
  });

  it('CA-008-02: ofrecer más cupos que los libres, y los cupos reservados por solicitudes en pago, cuentan', async () => {
    const group = await harness.createGroup({ members: 1 }); // 3 libres
    await publish(group.ownerId, group, { slotsOffered: 4 }).expect(422);
    await seedRequest(harness, group, await harness.insertUser(), 'esperando_pago'); // 2 libres
    const tooMany = await publish(group.ownerId, group, { slotsOffered: 3 }).expect(422);
    expect(tooMany.body.code).toBe('NO_FREE_SLOTS');
    await publish(group.ownerId, group, { slotsOffered: 2 }).expect(201);
  });

  it('CA-008-02: un grupo que no recibe miembros o está congelado no publica', async () => {
    const closed = await harness.createGroup({ members: 1 });
    await harness.pool.query('UPDATE groups SET accepting_members = false WHERE id = $1', [
      closed.id,
    ]);
    const a = await publish(closed.ownerId, closed, { slotsOffered: 1 }).expect(422);
    expect(a.body.code).toBe('GROUP_NOT_ACCEPTING');

    const frozen = await harness.createGroup({ members: 1 });
    await harness.freezeGroup(frozen.id);
    const b = await publish(frozen.ownerId, frozen, { slotsOffered: 1 }).expect(422);
    expect(b.body.code).toBe('GROUP_FROZEN');
  });

  it('CA-008-03: una segunda publicación activa del mismo grupo responde 409', async () => {
    const group = await harness.createGroup({ members: 1 });
    await publish(group.ownerId, group, { slotsOffered: 1 }).expect(201);
    const second = await publish(group.ownerId, group, { slotsOffered: 1 }).expect(409);
    expect(second.body.code).toBe('LISTING_ALREADY_ACTIVE');
  });

  it('CA-008-22: un titular suspendido no publica: la sesión ya no es válida y el servicio responde ACCOUNT_RESTRICTED', async () => {
    const group = await harness.createGroup({ members: 1 });
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [
      group.ownerId,
    ]);

    // Por HTTP la cuenta suspendida ya no tiene sesión (spec 009); el servicio lo vuelve a exigir
    // por si la suspensión ocurre entre la sesión y la acción.
    await publish(group.ownerId, group, { slotsOffered: 1 }).expect(401);
    await expect(
      harness.app.get(ListingsService).publish(group.ownerId, group.id, { slotsOffered: 1 }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_RESTRICTED', httpStatus: 403 });
    expect(await listingRow(group.id)).toBeUndefined();
  });

  it('RN-008-07: 0 cupos, textos de 301 caracteres o con caracteres de control responden 400', async () => {
    const group = await harness.createGroup({ members: 1 });
    for (const body of [
      { slotsOffered: 0 },
      { slotsOffered: 1, description: 'a'.repeat(301) },
      { slotsOffered: 1, conditions: 'hola\u0007mundo' },
    ]) {
      const response = await publish(group.ownerId, group, body).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await listingRow(group.id)).toBeUndefined();
  });

  it('RF-008-01: solo el titular publica; un miembro recibe 403 y una persona ajena 404', async () => {
    const group = await harness.createGroup({ members: 2 });
    await publish(group.memberIds[0] as string, group, { slotsOffered: 1 }).expect(403);
    await publish(await harness.insertUser(), group, { slotsOffered: 1 }).expect(404);
    await publish(
      group.ownerId,
      { id: '00000000-0000-4000-8000-000000000000' },
      {
        slotsOffered: 1,
      },
    ).expect(404);
  });

  it('RF-008-03: el titular ve su publicación (o null); un miembro solo el resumen; una persona ajena 404', async () => {
    const group = await harness.createGroup({ members: 2 });
    const member = group.memberIds[0] as string;
    const empty = await call('get', group.ownerId, url(group)).expect(200);
    expect(empty.body).toBeNull();
    expect((await call('get', member, url(group)).expect(200)).body).toEqual({
      active: false,
      slotsOffered: null,
      expiresAt: null,
    });

    await publish(group.ownerId, group, { slotsOffered: 2, description: 'Hola' }).expect(201);

    const owner = await call('get', group.ownerId, url(group)).expect(200);
    expect(owner.body).toMatchObject({ status: 'activa', description: 'Hola', slotsOffered: 2 });
    const summary = await call('get', member, url(group)).expect(200);
    expect(summary.body).toEqual({ active: true, slotsOffered: 2, expiresAt: plus30 });
    expect(Object.keys(summary.body).sort()).toEqual(['active', 'expiresAt', 'slotsOffered']);
    await call('get', await harness.insertUser(), url(group)).expect(404);
  });

  it('RF-008-06: el titular edita cupos y textos; una versión vieja responde 409 STALE_STATE; más cupos que los libres, 422', async () => {
    const group = await harness.createGroup({ members: 1 }); // 3 libres
    const created = await publish(group.ownerId, group, { slotsOffered: 1 }).expect(201);

    const edited = await call('patch', group.ownerId, url(group))
      .send({ slotsOffered: 3, description: ' Nuevo ', version: created.body.version })
      .expect(200);
    expect(edited.body).toMatchObject({ slotsOffered: 3, description: 'Nuevo' });
    expect(edited.body.version).toBe(created.body.version + 1);

    const stale = await call('patch', group.ownerId, url(group))
      .send({ description: 'Otra', version: created.body.version })
      .expect(409);
    expect(stale.body.code).toBe('STALE_STATE');
    const tooMany = await call('patch', group.ownerId, url(group))
      .send({ slotsOffered: 4 })
      .expect(422);
    expect(tooMany.body.code).toBe('NO_FREE_SLOTS');
    await call('patch', group.memberIds[0] as string, url(group))
      .send({ description: 'x' })
      .expect(403);
  });

  it('RF-008-06: editar una publicación oculta la deja oculta', async () => {
    const group = await harness.createGroup({ members: 1 });
    await publish(group.ownerId, group, { slotsOffered: 1 }).expect(201);
    await harness.pool.query(
      `UPDATE listings SET status = 'oculta', hidden_at = now() WHERE group_id = $1`,
      [group.id],
    );

    const edited = await call('patch', group.ownerId, url(group))
      .send({ description: 'Ajustada' })
      .expect(200);

    expect(edited.body).toMatchObject({ status: 'oculta', description: 'Ajustada' });
    expect(edited.body.preview).toBeNull();
  });

  it('RF-008-05: renovar una publicación activa o expirada la deja activa por 30 días más', async () => {
    const group = await harness.createGroup({ members: 1 });
    await publish(group.ownerId, group, { slotsOffered: 2 }).expect(201);
    harness.clock.advance(10 * DAY_MS);
    const expectedExpiry = new Date(harness.clock.now().getTime() + 30 * DAY_MS).toISOString();

    const renewed = await call('post', group.ownerId, url(group, '/renew')).expect(200);
    expect(renewed.body).toMatchObject({ status: 'activa', expiresAt: expectedExpiry });
    expect(renewed.body.renewedAt).toBe(harness.clock.now().toISOString());

    await harness.pool.query(`UPDATE listings SET status = 'expirada' WHERE group_id = $1`, [
      group.id,
    ]);
    harness.clock.advance(DAY_MS);
    const again = await call('post', group.ownerId, url(group, '/renew')).expect(200);
    expect(again.body.status).toBe('activa');
    expect(again.body.expiresAt).toBe(
      new Date(harness.clock.now().getTime() + 30 * DAY_MS).toISOString(),
    );
  });

  it('RF-008-05: no se renueva una publicación oculta (LISTING_HIDDEN) ni sin cupos libres (NO_FREE_SLOTS)', async () => {
    const hidden = await harness.createGroup({ members: 1 });
    await publish(hidden.ownerId, hidden, { slotsOffered: 1 }).expect(201);
    await harness.pool.query(
      `UPDATE listings SET status = 'oculta', hidden_at = now() WHERE group_id = $1`,
      [hidden.id],
    );
    const a = await call('post', hidden.ownerId, url(hidden, '/renew')).expect(422);
    expect(a.body.code).toBe('LISTING_HIDDEN');

    const full = await harness.createGroup({ members: 1 });
    await publish(full.ownerId, full, { slotsOffered: 1 }).expect(201);
    await harness.pool.query(`UPDATE listings SET status = 'expirada' WHERE group_id = $1`, [
      full.id,
    ]);
    for (let i = 0; i < 3; i++) {
      const userId = await harness.insertUser();
      await harness.pool.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'miembro', 'creacion')`,
        [full.id, userId],
      );
    }
    const b = await call('post', full.ownerId, url(full, '/renew')).expect(422);
    expect(b.body.code).toBe('NO_FREE_SLOTS');
    await call('post', await harness.insertUser(), url(full, '/renew')).expect(404);
  });

  it('RF-008-06: retirar la publicación responde 204, la deja retirada y permite publicar de nuevo', async () => {
    const group = await harness.createGroup({ members: 1 });
    await publish(group.ownerId, group, { slotsOffered: 1 }).expect(201);
    await call('delete', group.memberIds[0] as string, url(group)).expect(403);

    await call('delete', group.ownerId, url(group)).expect(204);

    expect(await listingRow(group.id)).toMatchObject({ status: 'retirada', end_reason: 'titular' });
    const gone = await call('delete', group.ownerId, url(group)).expect(404);
    expect(gone.body.code).toBe('LISTING_NOT_FOUND');
    await publish(group.ownerId, group, { slotsOffered: 1 }).expect(201);
  });
});
