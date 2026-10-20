import request from 'supertest';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import {
  seedBulkListings,
  seedCatalogPlan,
  seedListing,
  seedReputation,
} from './support/listings-fixtures.js';
import { seedRequest } from './support/join-requests-fixtures.js';

interface Item {
  id: string;
  service: { name: string };
  estimatedShareCents: number;
  slotsOffered: number;
}

// Búsqueda de cupos libres (spec 008 US2, T013/T014) contra PostgreSQL real.
describe('Búsqueda de publicaciones', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);
  const ids = (body: { items: Item[] }): string[] => body.items.map((item) => item.id);
  let viewer: string;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    // Los reportes y solicitudes son append-only: se retiran las publicaciones previas.
    await harness.pool.query(
      `UPDATE listings SET status = 'retirada', hidden_at = NULL, ended_at = now(),
                           end_reason = 'titular'
        WHERE status IN ('activa', 'oculta', 'expirada')`,
    );
    viewer = await harness.insertUser();
  });

  it('RF-008-07: exige sesión', async () => {
    await request(harness.app.getHttpServer()).get('/listings').expect(401);
    await request(harness.app.getHttpServer())
      .get('/listings/0b7f4c1e-2d3a-4b5c-8d9e-1f2a3b4c5d6e')
      .expect(401);
  });

  it('CA-008-06: buscar «Netflix» solo devuelve publicaciones de ese servicio (sin mayúsculas ni tildes)', async () => {
    const netflix = await seedListing(harness, { serviceName: 'Netflix' });
    await seedListing(harness, { serviceName: 'Spotify' });
    await seedListing(harness, { serviceName: 'Disney+' });
    const tilde = await seedListing(harness, { serviceName: 'Música Plus' });

    const found = await get(viewer, '/listings?q=NETFLIX').expect(200);
    const accented = await get(viewer, '/listings?q=musica').expect(200);

    expect(ids(found.body).sort()).toEqual([netflix.listingId].sort());
    expect(ids(accented.body)).toEqual([tilde.listingId]);
  });

  it('CA-008-06: filtra por servicio del catálogo y por categoría', async () => {
    const video = await seedCatalogPlan(harness, 'Netflix', 'video');
    const music = await seedCatalogPlan(harness, 'Spotify', 'musica');
    const a = await seedListing(harness, { planId: video.planId });
    const b = await seedListing(harness, { planId: music.planId });
    await seedListing(harness, { serviceName: 'Personalizado' });

    const byService = await get(viewer, `/listings?serviceId=${video.serviceId}`).expect(200);
    const byCategory = await get(viewer, '/listings?category=musica').expect(200);

    expect(ids(byService.body)).toEqual([a.listingId]);
    expect(ids(byCategory.body)).toEqual([b.listingId]);
    expect(byCategory.body.items[0].service.category).toBe('musica');
  });

  it('RF-008-07: el texto de búsqueda trata % y _ como texto literal', async () => {
    await seedListing(harness, { serviceName: 'Netflix' });
    const res = await get(viewer, '/listings?q=%25').expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('CA-008-07: no ve las publicaciones de grupos donde es miembro, ni las propias (RF-008-08)', async () => {
    const mine = await seedListing(harness, { extraMembers: 0, serviceName: 'Propia' });
    const member = await seedListing(harness, { serviceName: 'Grupo ajeno' });
    await harness.pool.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'miembro', 'creacion')`,
      [member.groupId, viewer],
    );
    const other = await seedListing(harness, { serviceName: 'Otro' });

    const asMember = await get(viewer, '/listings').expect(200);
    const asOwner = await get(mine.ownerId, '/listings').expect(200);
    const detail = await get(viewer, `/listings/${member.listingId}`).expect(404);

    expect(ids(asMember.body).sort()).toEqual([mine.listingId, other.listingId].sort());
    expect(ids(asOwner.body).sort()).toEqual([member.listingId, other.listingId].sort());
    expect(detail.body.code).toBe('LISTING_NOT_FOUND');
  });

  it('RF-008-08: quien salió del grupo (estadía cerrada) sí vuelve a verlo', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    await harness.leaveGroup(seeded.groupId, seeded.memberIds[0] as string);
    const res = await get(seeded.memberIds[0] as string, '/listings').expect(200);
    expect(ids(res.body)).toEqual([seeded.listingId]);
  });

  it('RF-008-07: solo activas, vigentes, de grupos abiertos y titulares sin restricción', async () => {
    const visible = await seedListing(harness, { serviceName: 'Visible' });
    await seedListing(harness, { status: 'oculta' });
    await seedListing(harness, { status: 'expirada' });
    await seedListing(harness, {
      expiresAt: '2026-10-16T14:59:59.000Z',
      publishedAt: '2026-10-01T12:00:00.000Z',
    });
    const notAccepting = await seedListing(harness, {});
    await harness.pool.query('UPDATE groups SET accepting_members = false WHERE id = $1', [
      notAccepting.groupId,
    ]);
    const frozen = await seedListing(harness, {});
    await harness.freezeGroup(frozen.groupId);
    const suspended = await seedListing(harness, {});
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [
      suspended.ownerId,
    ]);
    const banned = await seedListing(harness, {});
    await harness.pool.query(`UPDATE users SET status = 'baneado' WHERE id = $1`, [banned.ownerId]);
    const closed = await seedListing(harness, {});
    await harness.pool.query(
      `UPDATE listings SET status = 'cerrada', slots_offered = 0, ended_at = now(), end_reason = 'grupo_cerrado' WHERE id = $1`,
      [closed.listingId],
    );
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [closed.groupId],
    );

    const res = await get(viewer, '/listings').expect(200);
    expect(ids(res.body)).toEqual([visible.listingId]);
  });

  it('RN-008-04: los cupos mostrados descuentan los reservados y sin cupos no aparece', async () => {
    // 5 cupos, titular + 2 miembros → 2 libres; se ofrecen 2.
    const seeded = await seedListing(harness, { extraMembers: 2, offered: 2 });
    const applicant = await harness.insertUser();
    const before = await get(viewer, '/listings').expect(200);
    expect(before.body.items[0].slotsOffered).toBe(2);

    await seedRequest(harness, { id: seeded.groupId }, applicant, 'esperando_pago');
    const reserved = await get(viewer, '/listings').expect(200);
    expect(reserved.body.items[0].slotsOffered).toBe(1);

    const second = await harness.insertUser();
    await seedRequest(harness, { id: seeded.groupId }, second, 'esperando_pago');
    const none = await get(viewer, '/listings').expect(200);
    expect(none.body.items).toEqual([]);
  });

  it('RF-008-03: la cuota estimada es la cuota base con miembros + cupos ofrecidos (CA-008-04)', async () => {
    await seedListing(harness, { totalBsCents: 9000, extraMembers: 1, offered: 1 });
    const res = await get(viewer, '/listings').expect(200);
    expect(res.body.items[0].estimatedShareCents).toBe(3000);
    expect(res.body.items[0].estimatedShareLabel).toBe('estimada');
  });

  it('RF-008-07: filtra por rango de cuota estimada (SQL y vista coinciden)', async () => {
    const cheap = await seedListing(harness, { totalBsCents: 3000, extraMembers: 1, offered: 1 }); // 10,00 (3 personas)
    const mid = await seedListing(harness, { totalBsCents: 6001, extraMembers: 1, offered: 1 }); // 20,00
    const dear = await seedListing(harness, { totalBsCents: 9000, extraMembers: 0, offered: 1 }); // 45,00 (2 personas)

    const range = await get(viewer, '/listings?minShareCents=1500&maxShareCents=3000').expect(200);
    const min = await get(viewer, '/listings?minShareCents=2001').expect(200);
    const invalid = await get(viewer, '/listings?minShareCents=500&maxShareCents=100').expect(400);

    expect(ids(range.body)).toEqual([mid.listingId]);
    expect(range.body.items[0].estimatedShareCents).toBe(2000);
    expect(ids(min.body)).toEqual([dear.listingId]);
    expect(cheap.listingId).toBeDefined();
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('RF-008-07: ordena por cuota ascendente, por fecha descendente y por puntualidad', async () => {
    const a = await seedListing(harness, {
      totalBsCents: 9000,
      publishedAt: '2026-10-01T00:00:00Z',
    });
    const b = await seedListing(harness, {
      totalBsCents: 3000,
      publishedAt: '2026-10-02T00:00:00Z',
    });
    const c = await seedListing(harness, {
      totalBsCents: 6000,
      publishedAt: '2026-10-03T00:00:00Z',
    });
    await seedReputation(harness, a.ownerId, 'Excelente', 10);
    await seedReputation(harness, c.ownerId, 'Regular', 6);

    const byShare = await get(viewer, '/listings?sort=cuota').expect(200);
    const byDate = await get(viewer, '/listings').expect(200);
    const byPunctuality = await get(viewer, '/listings?sort=puntualidad').expect(200);

    expect(ids(byShare.body)).toEqual([b.listingId, c.listingId, a.listingId]);
    expect(ids(byDate.body)).toEqual([c.listingId, b.listingId, a.listingId]);
    expect(ids(byPunctuality.body)).toEqual([a.listingId, c.listingId, b.listingId]);
  });

  it('RF-008-09: pagina por cursor sin repetir ni omitir en los tres órdenes, con empates', async () => {
    const created: string[] = [];
    for (let i = 0; i < 7; i++) {
      const seeded = await seedListing(harness, {
        // Cuotas y fechas repetidas para forzar desempates.
        totalBsCents: i % 2 === 0 ? 6000 : 9000,
        publishedAt: `2026-10-0${1 + (i % 3)}T00:00:00Z`,
      });
      created.push(seeded.listingId);
    }
    for (const sort of ['fecha', 'cuota', 'puntualidad']) {
      const all = await get(viewer, `/listings?sort=${sort}&limit=50`).expect(200);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/listings?sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
        const page = await get(viewer, url).expect(200);
        seen.push(...ids(page.body));
        cursor = page.body.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages).toBe(3);
      expect(seen).toEqual(ids(all.body));
      expect([...seen].sort()).toEqual([...created].sort());
    }
  });

  it('RF-008-09: rechaza un cursor inválido o de otro orden y un límite fuera de rango', async () => {
    await seedListing(harness, {});
    await seedListing(harness, {});
    const first = await get(viewer, '/listings?limit=1').expect(200);
    const bad = await get(viewer, '/listings?cursor=zzz').expect(400);
    await get(viewer, `/listings?sort=cuota&cursor=${first.body.nextCursor}`).expect(400);
    await get(viewer, '/listings?limit=51').expect(400);
    await get(viewer, '/listings?limit=0').expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('RF-008-03: la vista indica la solicitud propia y por qué no puede solicitar', async () => {
    const seeded = await seedListing(harness, { billingDay: 5 });
    const open = await seedListing(harness, {});
    const requestId = await seedRequest(harness, { id: open.groupId }, viewer, 'abierta');

    const res = await get(viewer, '/listings?sort=cuota').expect(200);
    const byId = new Map(res.body.items.map((item: { id: string }) => [item.id, item]));
    const closedWindow = byId.get(seeded.listingId) as Record<string, unknown>;
    const withRequest = byId.get(open.listingId) as Record<string, unknown>;

    expect(closedWindow.canRequest).toBe(false);
    expect(closedWindow.cannotRequestReason).toBe('VENTANA_CERRADA');
    expect(withRequest.myRequest).toEqual({ id: requestId, status: 'abierta' });
    expect(withRequest.cannotRequestReason).toBe('SOLICITUD_ACTIVA');
  });

  it('RNF-008-02: responde en menos de 500 ms con 5.000 publicaciones', async () => {
    await seedBulkListings(harness, 5000);
    // Calienta la caché del plan y de las tablas.
    await get(viewer, '/listings?limit=50').expect(200);
    const timings: number[] = [];
    for (const url of [
      '/listings?limit=50',
      '/listings?q=netflix&limit=50',
      '/listings?sort=cuota&limit=50',
      '/listings?sort=puntualidad&minShareCents=1000&maxShareCents=4000&limit=50',
    ]) {
      const start = performance.now();
      const res = await get(viewer, url).expect(200);
      timings.push(performance.now() - start);
      expect(res.body.items.length).toBeGreaterThan(0);
    }
    for (const ms of timings) expect(ms).toBeLessThan(500);
    expect(NOW).toBeDefined();
  }, 120_000);
});
