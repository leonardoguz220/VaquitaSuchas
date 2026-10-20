import request from 'supertest';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { BillingHarness } from './support/billing-harness.js';
import { seedListing } from './support/listings-fixtures.js';

// Detalle de una publicación (spec 008 US2, T013/T014): privacidad y forma de la respuesta.
describe('Detalle de publicación', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);

  const VIEW_KEYS = [
    'billingDay',
    'cannotRequestReason',
    'canRequest',
    'conditions',
    'description',
    'entryWindow',
    'estimatedShareCents',
    'estimatedShareLabel',
    'expiresAt',
    'id',
    'myRequest',
    'owner',
    'publishedAt',
    'service',
    'slotsOffered',
  ].sort();

  it('CA-008-05: no expone miembros, datos de pago, código ni celular; solo la lista blanca de campos', async () => {
    const seeded = await seedListing(harness, {
      ownerName: 'Titular Visible',
      extraMembers: 2,
      paymentText: 'Cuenta secreta 987654',
      description: 'Cupo en <script>alert(1)</script> & más',
      conditions: 'Pago puntual',
    });
    const names = await harness.pool.query<{ full_name: string; phone_e164: string }>(
      `SELECT u.full_name, u.phone_e164 FROM users u WHERE u.id = ANY($1::uuid[])`,
      [[seeded.ownerId, ...seeded.memberIds]],
    );
    const code = await harness.pool.query<{ invite_code: string }>(
      'SELECT invite_code FROM groups WHERE id = $1',
      [seeded.groupId],
    );
    const viewer = await harness.insertUser();

    const res = await get(viewer, `/listings/${seeded.listingId}`).expect(200);
    const body = JSON.stringify(res.body);

    expect(Object.keys(res.body).sort()).toEqual(VIEW_KEYS);
    expect(Object.keys(res.body.owner).sort()).toEqual(['fullName', 'level']);
    expect(res.body.owner).toEqual({ fullName: 'Titular Visible', level: 'Nuevo' });
    for (const row of names.rows) {
      if (row.full_name !== 'Titular Visible') expect(body).not.toContain(row.full_name);
      expect(body).not.toContain(row.phone_e164);
    }
    expect(body).not.toContain('987654');
    expect(body).not.toContain(code.rows[0]?.invite_code);
    expect(body).not.toContain(seeded.groupId);
    expect(body).not.toContain(seeded.ownerId);
    for (const memberId of seeded.memberIds) expect(body).not.toContain(memberId);
  });

  it('CA-008-19: el texto con <script> se entrega tal cual, como texto plano', async () => {
    const seeded = await seedListing(harness, { description: '<script>alert(1)</script>' });
    const viewer = await harness.insertUser();
    const res = await get(viewer, `/listings/${seeded.listingId}`).expect(200);
    expect(res.body.description).toBe('<script>alert(1)</script>');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('CA-008-23: ventana cerrada → no puede solicitar y trae la fecha de apertura; abierta → fecha de cierre', async () => {
    const closed = await seedListing(harness, { billingDay: 5 });
    const open = await seedListing(harness, { billingDay: 15 });
    const viewer = await harness.insertUser();

    const closedView = await get(viewer, `/listings/${closed.listingId}`).expect(200);
    const openView = await get(viewer, `/listings/${open.listingId}`).expect(200);

    expect(closedView.body.entryWindow).toEqual({
      isOpen: false,
      opensAt: '2026-11-05T04:00:00.000Z',
      closesAt: null,
    });
    expect(closedView.body.canRequest).toBe(false);
    expect(closedView.body.cannotRequestReason).toBe('VENTANA_CERRADA');
    expect(openView.body.entryWindow.isOpen).toBe(true);
    expect(openView.body.entryWindow.opensAt).toBeNull();
    expect(openView.body.entryWindow.closesAt).toBe('2026-10-19T03:59:59.000Z');
    expect(openView.body.canRequest).toBe(true);
    expect(openView.body.cannotRequestReason).toBeNull();
  });

  it('RF-008-04: 404 LISTING_NOT_FOUND si no está activa, es propia, es inexistente o el id es inválido', async () => {
    const hidden = await seedListing(harness, { status: 'oculta' });
    const expired = await seedListing(harness, { status: 'expirada' });
    const own = await seedListing(harness, {});
    const viewer = await harness.insertUser();

    for (const id of [
      hidden.listingId,
      expired.listingId,
      '0b7f4c1e-2d3a-4b5c-8d9e-1f2a3b4c5d6e',
    ]) {
      const res = await get(viewer, `/listings/${id}`).expect(404);
      expect(res.body.code).toBe('LISTING_NOT_FOUND');
    }
    await get(own.ownerId, `/listings/${own.listingId}`).expect(404);
    await get(viewer, '/listings/no-es-un-uuid').expect(404);
  });
});
