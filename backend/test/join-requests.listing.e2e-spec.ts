import request from 'supertest';
import { DbService } from '../src/shared/db/db.service.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import type {
  JoinRequestAccepted,
  JoinRequestOpened,
} from '../src/shared/events/join-request-events.js';
import { JoinRequestsModule } from '../src/modules/join-requests/join-requests.module.js';
import { JoinRequestsService } from '../src/modules/join-requests/services/join-requests.service.js';
import { BillingHarness, type TestGroup } from './support/billing-harness.js';
import { seedRequest } from './support/join-requests-fixtures.js';

// Solicitudes que nacen de una publicación (spec 010 T036 / spec 008): coherencia con los cupos
// ofrecidos (RF-010-20, CA-010-06), apertura desde la publicación y rechazo al cerrarse.
describe('Solicitudes de ingreso desde publicaciones', () => {
  const harness = new BillingHarness({ imports: [JoinRequestsModule] });
  const service = (): JoinRequestsService => harness.app.get(JoinRequestsService);
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const post = (userId: string, url: string, body: object = {}): request.Test =>
    http()
      .post(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);
  const statusOf = async (id: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0]?.status as string;

  /** Publicación (insertada tal cual; los disparadores validan) de un grupo de 5 cupos. */
  async function listingOf(group: TestGroup, offered: number): Promise<string> {
    const result = await harness.pool.query<{ id: string }>(
      `INSERT INTO listings (group_id, slots_offered, published_at, expires_at)
       VALUES ($1, $2, '2026-10-10T12:00:00Z', '2026-11-09T12:00:00Z') RETURNING id`,
      [group.id, offered],
    );
    return (result.rows[0] as { id: string }).id;
  }
  /** Marca una solicitud sembrada como originada en la publicación (el CHECK pide ambas columnas). */
  const fromListing = (requestId: string, listingId: string): Promise<unknown> =>
    harness.pool.query(
      `UPDATE join_requests SET source = 'publicacion', listing_id = $2 WHERE id = $1`,
      [requestId, listingId],
    );

  beforeAll(() => harness.start(), 60_000);
  beforeEach(() => {
    harness.storage.files.set('proofs/test.png', {
      body: new Uint8Array([0x89, 0x50]),
      contentType: 'image/png',
    });
  });
  afterAll(() => harness.stop(), 30_000);

  it('RF-008-10: openFromListing guarda source, listing_id, la primera línea del chat y publica el evento', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 2);
    const applicant = await harness.insertUser();
    const published: JoinRequestOpened[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<JoinRequestOpened>('join-requests.opened', (_tx, event) => {
        if (event.groupId === group.id) published.push(event);
      });

    const view = await service().openFromListing(
      applicant,
      { id: listingId, groupId: group.id },
      'Hola, quiero un cupo',
    );

    expect(view.phase.status).toBe('abierta');
    const row = await harness.pool.query<{ source: string; listing_id: string }>(
      'SELECT source, listing_id FROM join_requests WHERE id = $1',
      [view.id],
    );
    expect(row.rows[0]).toEqual({ source: 'publicacion', listing_id: listingId });
    const messages = await harness.pool.query<{ body: string; sender_id: string }>(
      'SELECT body, sender_id FROM join_messages WHERE request_id = $1',
      [view.id],
    );
    expect(messages.rows).toEqual([{ body: 'Hola, quiero un cupo', sender_id: applicant }]);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ source: 'publicacion', listingId });
  });

  it('RF-008-10: sin mensaje no hay primera línea; los límites de la spec 010 rigen igual (una activa por grupo)', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 1);
    const applicant = await harness.insertUser();
    const ref = { id: listingId, groupId: group.id };

    const view = await service().openFromListing(applicant, ref, null);
    const count = await harness.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM join_messages WHERE request_id = $1',
      [view.id],
    );
    expect(count.rows[0]?.n).toBe('0');
    await expect(service().openFromListing(applicant, ref, null)).rejects.toMatchObject({
      code: 'ACTIVE_REQUEST_EXISTS',
    });
  });

  it('CA-010-06 (cupos ofrecidos) y RF-010-20: con 1 cupo ofrecido y 3 libres, solo una solicitud de la publicación pasa a esperando_pago', async () => {
    const group = await harness.createGroup({ members: 1 }); // 2 de 5: 3 libres
    const listingId = await listingOf(group, 1);
    const ids = [
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
      await seedRequest(harness, group, await harness.insertUser(), 'abierta'),
    ];
    for (const id of ids) await fromListing(id, listingId);

    const results = [];
    for (const id of ids)
      results.push(await post(group.ownerId, `/join-requests/${id}/payment-data`));

    expect(results.map((r) => r.status)).toEqual([200, 422]);
    expect(results[1]?.body.code).toBe('NO_SLOTS_AVAILABLE');
    expect([await statusOf(ids[0] as string), await statusOf(ids[1] as string)]).toEqual([
      'esperando_pago',
      'abierta',
    ]);
  });

  it('CA-010-06 (cupos ofrecidos): una solicitud por código no queda limitada por los cupos ofrecidos de la publicación', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 1);
    const viaListing = await seedRequest(
      harness,
      group,
      await harness.insertUser(),
      'esperando_pago',
    );
    await fromListing(viaListing, listingId);
    const viaCode = await seedRequest(harness, group, await harness.insertUser(), 'abierta');

    await post(group.ownerId, `/join-requests/${viaCode}/payment-data`).expect(200);
  });

  it('RF-010-20: aceptar no supera slots_offered; con la publicación cerrada se rechaza y nadie ingresa', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 1);
    const applicant = await harness.insertUser();
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    await fromListing(id, listingId);
    await harness.pool.query(
      `UPDATE listings SET status = 'cerrada', slots_offered = 0, ended_at = now(),
              end_reason = 'cupos_completos' WHERE id = $1`,
      [listingId],
    );

    const response = await post(group.ownerId, `/join-requests/${id}/confirm`);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('NO_SLOTS_AVAILABLE');
    expect(await statusOf(id)).toBe('pago_informado');
    const members = await harness.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [group.id],
    );
    expect(members.rows[0]?.n).toBe('2');
  });

  it('RF-010-20: JoinRequestAccepted lleva el listingId de la publicación de origen', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 2);
    const applicant = await harness.insertUser();
    const id = await seedRequest(harness, group, applicant, 'pago_informado');
    await fromListing(id, listingId);
    const accepted: JoinRequestAccepted[] = [];
    harness.app
      .get(TxEventBus, { strict: false })
      .register<JoinRequestAccepted>('join-requests.accepted', (_tx, event) => {
        if (event.requestId === id) accepted.push(event);
      });

    await post(group.ownerId, `/join-requests/${id}/confirm`).expect(200);

    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.listingId).toBe(listingId);
  });

  it('RN-010-05 y CA-008-11: rejectOpenForListing rechaza las abierta de la publicación y respeta las que están en pago', async () => {
    const group = await harness.createGroup({ members: 1 });
    const listingId = await listingOf(group, 1);
    const other = await listingOf(await harness.createGroup({ members: 1 }), 1);
    const open = await seedRequest(harness, group, await harness.insertUser(), 'abierta');
    const paying = await seedRequest(harness, group, await harness.insertUser(), 'esperando_pago');
    const elsewhere = await seedRequest(
      harness,
      (await groupOfListing(other)) as TestGroup,
      await harness.insertUser(),
      'abierta',
    );
    await fromListing(open, listingId);
    await fromListing(paying, listingId);
    await fromListing(elsewhere, other);

    const rejected = await harness.app
      .get(DbService)
      .withTransaction((tx) => service().rejectOpenForListing(tx, listingId, 'sin_cupo'));

    expect(rejected).toBe(1);
    expect(await statusOf(open)).toBe('rechazada');
    expect(await statusOf(paying)).toBe('esperando_pago');
    expect(await statusOf(elsewhere)).toBe('abierta');
    const reason = await harness.pool.query<{ final_reason: string }>(
      'SELECT final_reason FROM join_requests WHERE id = $1',
      [open],
    );
    expect(reason.rows[0]?.final_reason).toBe('sin_cupo');
    // Idempotente: repetirlo no cambia nada.
    const again = await harness.app
      .get(DbService)
      .withTransaction((tx) => service().rejectOpenForListing(tx, listingId, 'sin_cupo'));
    expect(again).toBe(0);
  });

  /** Grupo (mínimo) de una publicación, para sembrarle una solicitud. */
  async function groupOfListing(listingId: string): Promise<Pick<TestGroup, 'id'>> {
    const result = await harness.pool.query<{ group_id: string }>(
      'SELECT group_id FROM listings WHERE id = $1',
      [listingId],
    );
    return { id: (result.rows[0] as { group_id: string }).group_id } as TestGroup;
  }
});
