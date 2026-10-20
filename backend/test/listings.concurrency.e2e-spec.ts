import request from 'supertest';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';

const PROOF_KEY = 'proofs/test.png';

// Carreras por el último cupo ofrecido (spec 008, CA-008-12; RNF-008-03) con PostgreSQL real.
describe('Concurrencia sobre los cupos ofrecidos de una publicación', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const call = (method: 'post', userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const statusOf = async (id: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>(
        'SELECT status FROM join_requests WHERE id = $1',
        [id],
      )
    ).rows[0]?.status as string;
  const activeMembers = async (groupId: string): Promise<number> =>
    Number(
      (
        await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
          [groupId],
        )
      ).rows[0]?.n,
    );

  /** Grupo con 3 cupos libres, una publicación de 1 cupo y dos solicitudes abiertas. */
  async function contested(): Promise<{ group: TestGroup; listingId: string; ids: string[] }> {
    const group = await harness.createGroup({ members: 1 });
    const listing = await call('post', group.ownerId, `/groups/${group.id}/listing`)
      .send({ slotsOffered: 1 })
      .expect(201);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const applicant = await harness.insertUser();
      const opened = await call('post', applicant, `/listings/${listing.body.id}/requests`)
        .send({})
        .expect(201);
      ids.push(opened.body.id);
    }
    return { group, listingId: listing.body.id, ids };
  }
  async function informPayment(requestId: string): Promise<void> {
    await harness.pool.query(
      `UPDATE join_requests
          SET status = 'pago_informado', proof_key = $2, proof_mime = 'image/png',
              proof_size_bytes = 4, proof_method = 'qr', proof_reference = 'REF-1',
              proof_uploaded_at = $3, decision_deadline_at = $4, version = version + 1
        WHERE id = $1`,
      [requestId, PROOF_KEY, NOW, new Date(Date.parse(NOW) + 24 * 3600_000).toISOString()],
    );
  }

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => {
    harness.storage.files.set(PROOF_KEY, {
      body: new Uint8Array([0x89, 0x50]),
      contentType: 'image/png',
    });
  });

  it('CA-008-12: dos solicitudes que compiten por el último cupo ofrecido: solo una pasa a esperando_pago y solo una llega a aceptarse', async () => {
    const { group, listingId, ids } = await contested();

    const results = await Promise.all(
      ids.map((id) => call('post', group.ownerId, `/join-requests/${id}/payment-data`)),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(results.find((r) => r.status === 422)?.body.code).toBe('NO_SLOTS_AVAILABLE');
    const winner = ids[results.findIndex((r) => r.status === 200)] as string;
    const loser = ids.find((id) => id !== winner) as string;
    await informPayment(winner);

    await call('post', group.ownerId, `/join-requests/${winner}/confirm`).expect(200);

    expect(await statusOf(winner)).toBe('aceptada');
    expect(await statusOf(loser)).toBe('rechazada');
    expect(await activeMembers(group.id)).toBe(3);
    const listing = await harness.pool.query<{ status: string; slots_offered: number }>(
      'SELECT status, slots_offered FROM listings WHERE id = $1',
      [listingId],
    );
    expect(listing.rows[0]).toEqual({ status: 'cerrada', slots_offered: 0 });
  });

  it('CA-008-12: confirmar a una mientras el titular envía los datos de pago a la otra nunca deja a dos con el cupo', async () => {
    const { group, listingId, ids } = await contested();
    const [first, second] = ids as [string, string];
    await call('post', group.ownerId, `/join-requests/${first}/payment-data`).expect(200);
    await informPayment(first);

    const [confirm, payment] = await Promise.all([
      call('post', group.ownerId, `/join-requests/${first}/confirm`),
      call('post', group.ownerId, `/join-requests/${second}/payment-data`),
    ]);

    expect(confirm.status).toBe(200);
    // Antes de confirmar: cupo reservado (422). Después: la otra ya fue rechazada (409).
    expect([409, 422]).toContain(payment.status);
    expect(await statusOf(first)).toBe('aceptada');
    expect(['rechazada', 'abierta']).toContain(await statusOf(second));
    expect(await statusOf(second)).not.toBe('esperando_pago');
    expect(await activeMembers(group.id)).toBe(3);
    expect(
      (
        await harness.pool.query<{ status: string }>('SELECT status FROM listings WHERE id = $1', [
          listingId,
        ])
      ).rows[0]?.status,
    ).toBe('cerrada');
  });
});
