import request from 'supertest';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { DbService } from '../src/shared/db/db.service.js';
import { ListingsService } from '../src/modules/listings/services/listings.service.js';
import { ListingReportsService } from '../src/modules/listings/services/listing-reports.service.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { seedListing } from './support/listings-fixtures.js';
import { setClock } from './support/join-requests-fixtures.js';

const HOUR = 3600_000;
const at = (hours: number): string => new Date(Date.parse(NOW) + hours * HOUR).toISOString();

// Reportes de publicaciones (spec 008 US4, T021/T022) contra PostgreSQL real.
describe('Reportes de publicaciones', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const report = (userId: string, listingId: string, body: object = { reason: 'spam' }) =>
    request(harness.app.getHttpServer())
      .post(`/listings/${listingId}/reports`)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body);
  const statusOf = async (listingId: string): Promise<string> =>
    (
      await harness.pool.query<{ status: string }>('SELECT status FROM listings WHERE id = $1', [
        listingId,
      ])
    ).rows[0]?.status as string;

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(() => setClock(harness, NOW));

  it('CA-008-17: el tercer reporte de usuarios distintos oculta la publicación y avisa al titular', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    const reporters = [
      await harness.insertUser(),
      await harness.insertUser(),
      await harness.insertUser(),
    ];

    for (const userId of reporters.slice(0, 2)) {
      await report(userId, seeded.listingId, { reason: 'spam', comment: 'Parece falso' }).expect(
        204,
      );
    }
    expect(await statusOf(seeded.listingId)).toBe('activa');
    await report(reporters[2] as string, seeded.listingId, { reason: 'otro' }).expect(204);

    expect(await statusOf(seeded.listingId)).toBe('oculta');
    const row = (
      await harness.pool.query<{ hidden_at: Date | null }>(
        'SELECT hidden_at FROM listings WHERE id = $1',
        [seeded.listingId],
      )
    ).rows[0];
    expect(row?.hidden_at?.toISOString()).toBe(NOW);
    const notices = await harness.pool.query<{ user_id: string; type: string }>(
      `SELECT user_id, type FROM notifications WHERE type = 'publicacion_oculta'`,
    );
    expect(notices.rows).toEqual([{ user_id: seeded.ownerId, type: 'publicacion_oculta' }]);
  });

  it('CA-008-17: una publicación oculta sale de la búsqueda y deja de aceptar reportes', async () => {
    const seeded = await seedListing(harness);
    for (let i = 0; i < 3; i++)
      await report(await harness.insertUser(), seeded.listingId).expect(204);

    const viewer = await harness.insertUser();
    const search = await request(harness.app.getHttpServer())
      .get(`/listings/${seeded.listingId}`)
      .set('Authorization', `Bearer ${harness.token(viewer)}`);
    expect(search.status).toBe(404);
    const again = await report(await harness.insertUser(), seeded.listingId).expect(404);
    expect(again.body.code).toBe('LISTING_NOT_FOUND');
  });

  it('CA-008-18: reportar dos veces la misma publicación responde 409 ALREADY_REPORTED y no suma', async () => {
    const seeded = await seedListing(harness);
    const reporter = await harness.insertUser();
    await report(reporter, seeded.listingId).expect(204);

    const second = await report(reporter, seeded.listingId).expect(409);

    expect(second.body.code).toBe('ALREADY_REPORTED');
    const count = await harness.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM listing_reports WHERE listing_id = $1',
      [seeded.listingId],
    );
    expect(count.rows[0]?.n).toBe('1');
  });

  it('RF-008-17: el titular no puede reportar su publicación (422); inexistente o de un grupo propio de miembro, 404', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });

    const own = await report(seeded.ownerId, seeded.listingId).expect(422);
    expect(own.body.code).toBe('BUSINESS_RULE');
    expect(own.body.details).toMatchObject({ rule: 'CANNOT_REPORT_OWN_LISTING' });
    await report(seeded.memberIds[0] as string, seeded.listingId).expect(404);
    await report(await harness.insertUser(), '00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('RF-008-17: motivo inválido o comentario de más de 300 caracteres responde 400', async () => {
    const seeded = await seedListing(harness);
    const reporter = await harness.insertUser();

    await report(reporter, seeded.listingId, { reason: 'nada' }).expect(400);
    await report(reporter, seeded.listingId, { reason: 'spam', comment: 'a'.repeat(301) }).expect(
      400,
    );
    await report(reporter, seeded.listingId, { reason: 'spam', comment: 'a'.repeat(300) }).expect(
      204,
    );
  });

  it('RNF-008-04: el reporte número 11 en 24 horas responde 429 RATE_LIMITED; tras 24 horas se puede', async () => {
    const reporter = await harness.insertUser();
    for (let i = 0; i < 10; i++) {
      const seeded = await seedListing(harness);
      await report(reporter, seeded.listingId).expect(204);
    }
    const eleventh = await seedListing(harness);

    const blocked = await report(reporter, eleventh.listingId).expect(429);

    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(await statusOf(eleventh.listingId)).toBe('activa');
    setClock(harness, at(25));
    await report(reporter, eleventh.listingId).expect(204);
  });

  it('RF-008-18: solo cuentan los reportes posteriores a moderation_cleared_at', async () => {
    const seeded = await seedListing(harness);
    await report(await harness.insertUser(), seeded.listingId).expect(204);
    await report(await harness.insertUser(), seeded.listingId).expect(204);
    setClock(harness, at(2));
    await harness.pool.query('UPDATE listings SET moderation_cleared_at = $2 WHERE id = $1', [
      seeded.listingId,
      at(1),
    ]);

    await report(await harness.insertUser(), seeded.listingId).expect(204);
    await report(await harness.insertUser(), seeded.listingId).expect(204);
    expect(await statusOf(seeded.listingId)).toBe('activa');
    await report(await harness.insertUser(), seeded.listingId).expect(204);

    expect(await statusOf(seeded.listingId)).toBe('oculta');
  });

  it('CA-008-22: una cuenta suspendida no reporta: sin sesión por HTTP y ACCOUNT_RESTRICTED en el servicio', async () => {
    const seeded = await seedListing(harness);
    const reporter = await harness.insertUser();
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [reporter]);

    await report(reporter, seeded.listingId).expect(401);
    await expect(
      harness.app.get(ListingReportsService).report(reporter, seeded.listingId, { reason: 'spam' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_RESTRICTED', httpStatus: 403 });
    const count = await harness.pool.query('SELECT 1 FROM listing_reports WHERE reporter_id = $1', [
      reporter,
    ]);
    expect(count.rowCount).toBe(0);
  });

  it('RF-008-18: sin sesión responde 401', async () => {
    const seeded = await seedListing(harness);
    await request(harness.app.getHttpServer())
      .post(`/listings/${seeded.listingId}/reports`)
      .send({ reason: 'spam' })
      .expect(401);
  });

  it('RF-008-18: adminRestore deja la publicación activa y los reportes anteriores ya no cuentan; adminRemove la retira por moderación', async () => {
    const seeded = await seedListing(harness);
    for (let i = 0; i < 3; i++)
      await report(await harness.insertUser(), seeded.listingId).expect(204);
    const service = harness.app.get(ListingsService);
    const db = harness.app.get(DbService);
    expect(
      (await service.listReported()).find((r) => r.listingId === seeded.listingId),
    ).toMatchObject({
      listingId: seeded.listingId,
      status: 'oculta',
      reportCount: 3,
    });

    await db.withTransaction((tx) => service.adminRestore(tx, seeded.listingId));

    const restored = await harness.pool.query<{ status: string; cleared: Date | null }>(
      'SELECT status, moderation_cleared_at AS cleared FROM listings WHERE id = $1',
      [seeded.listingId],
    );
    expect(restored.rows[0]?.status).toBe('activa');
    expect(restored.rows[0]?.cleared?.toISOString()).toBe(NOW);
    expect((await service.listReported()).filter((r) => r.listingId === seeded.listingId)).toEqual(
      [],
    );

    await db.withTransaction((tx) => service.adminRemove(tx, seeded.listingId));

    const removed = await harness.pool.query<{ status: string; end_reason: string }>(
      'SELECT status, end_reason FROM listings WHERE id = $1',
      [seeded.listingId],
    );
    expect(removed.rows[0]).toEqual({ status: 'retirada', end_reason: 'moderacion' });
  });
});
