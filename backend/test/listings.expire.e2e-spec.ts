import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { ListingsModule } from '../src/modules/listings/listings.module.js';
import { BillingHarness, NOW } from './support/billing-harness.js';
import { seedListing } from './support/listings-fixtures.js';
import { seedRequest, setClock } from './support/join-requests-fixtures.js';

// Tarea `listings.expire` (spec 008 US5, T024/T025) contra PostgreSQL real.
describe('Tarea listings.expire', () => {
  const harness = new BillingHarness({ imports: [ListingsModule] });
  const run = async () => {
    const [result] = await harness.app
      .get(JobRunner, { strict: false })
      .runAll('manual', { job: 'listings.expire' });
    return result;
  };
  const row = async (listingId: string) =>
    (
      await harness.pool.query<{
        status: string;
        slots_offered: number;
        end_reason: string | null;
      }>('SELECT status, slots_offered, end_reason FROM listings WHERE id = $1', [listingId])
    ).rows[0];
  const AFTER_30_DAYS = '2026-11-10T12:00:00.000Z';

  beforeAll(() => harness.start(), 60_000);
  afterAll(() => harness.stop(), 30_000);
  beforeEach(async () => {
    setClock(harness, NOW);
    // Cada prueba cuenta solo sus propias publicaciones.
    await harness.pool.query(
      `UPDATE listings SET status = 'retirada', ended_at = now(), end_reason = 'titular', hidden_at = NULL
        WHERE status IN ('activa', 'oculta', 'expirada')`,
    );
  });

  it('CA-008-14: una publicación de más de 30 días pasa a expirada; una vigente no cambia', async () => {
    const old = await seedListing(harness, { extraMembers: 1 });
    const fresh = await seedListing(harness, {
      extraMembers: 1,
      publishedAt: '2026-11-05T12:00:00.000Z',
    });
    setClock(harness, AFTER_30_DAYS);

    const result = await run();

    expect(result).toMatchObject({ job: 'listings.expire', status: 'ok', processed: 1 });
    expect((await row(old.listingId))?.status).toBe('expirada');
    expect((await row(fresh.listingId))?.status).toBe('activa');
  });

  it('CA-008-14: es idempotente: la segunda corrida no cambia nada', async () => {
    await seedListing(harness, { extraMembers: 1 });
    setClock(harness, AFTER_30_DAYS);
    await run();

    expect(await run()).toMatchObject({ status: 'ok', processed: 0 });
  });

  it('RN-008-04: cierra por grupo lleno y rechaza las solicitudes abiertas de la publicación', async () => {
    const seeded = await seedListing(harness, { extraMembers: 2, totalSlots: 5, offered: 1 });
    await harness.pool.query('UPDATE groups SET total_slots = 3 WHERE id = $1', [seeded.groupId]);
    const applicant = await harness.insertUser();
    const requestId = await seedRequest(harness, { id: seeded.groupId }, applicant, 'abierta');
    await harness.pool.query(
      `UPDATE join_requests SET listing_id = $2, source = 'publicacion' WHERE id = $1`,
      [requestId, seeded.listingId],
    );

    expect(await run()).toMatchObject({ status: 'ok', processed: 1 });

    expect(await row(seeded.listingId)).toMatchObject({
      status: 'cerrada',
      slots_offered: 0,
      end_reason: 'grupo_lleno',
    });
    const request = await harness.pool.query<{ status: string }>(
      'SELECT status FROM join_requests WHERE id = $1',
      [requestId],
    );
    expect(request.rows[0]?.status).toBe('rechazada');
  });

  it('RN-008-04: repara cupos ofrecidos mayores que los libres (p. ej. tras cambiar total_slots o salir un miembro)', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1, totalSlots: 5, offered: 3 });
    await harness.pool.query('UPDATE groups SET total_slots = 3 WHERE id = $1', [seeded.groupId]);

    expect(await run()).toMatchObject({ status: 'ok', processed: 1 });

    expect(await row(seeded.listingId)).toMatchObject({ status: 'activa', slots_offered: 1 });
  });

  it('CA-008-16: cierra la publicación de un grupo cerrado o congelado y la de un titular baneado', async () => {
    const closed = await seedListing(harness, { extraMembers: 1 });
    const frozen = await seedListing(harness, { extraMembers: 1 });
    const banned = await seedListing(harness, { extraMembers: 1 });
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [closed.groupId],
    );
    await harness.pool.query(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
      [frozen.groupId],
    );
    await harness.pool.query(`UPDATE users SET status = 'baneado' WHERE id = $1`, [banned.ownerId]);

    expect(await run()).toMatchObject({ status: 'ok', processed: 3 });

    expect((await row(closed.listingId))?.end_reason).toBe('grupo_cerrado');
    expect((await row(frozen.listingId))?.end_reason).toBe('grupo_congelado');
    expect((await row(banned.listingId))?.end_reason).toBe('grupo_congelado');
  });

  it('RN-008-04: un titular suspendido no cierra su publicación (solo la búsqueda la oculta)', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    await harness.pool.query(`UPDATE users SET status = 'suspendido' WHERE id = $1`, [
      seeded.ownerId,
    ]);

    expect(await run()).toMatchObject({ status: 'ok', processed: 0 });

    expect((await row(seeded.listingId))?.status).toBe('activa');
  });

  it('RNF-008-03: con el grupo bloqueado por otra transacción (SKIP LOCKED) salta la publicación y la procesa después', async () => {
    const seeded = await seedListing(harness, { extraMembers: 1 });
    setClock(harness, AFTER_30_DAYS);
    const client = await harness.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT 1 FROM groups WHERE id = $1 FOR UPDATE', [seeded.groupId]);

      expect(await run()).toMatchObject({ status: 'ok', processed: 0 });
      expect((await row(seeded.listingId))?.status).toBe('activa');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }

    expect(await run()).toMatchObject({ status: 'ok', processed: 1 });
    expect((await row(seeded.listingId))?.status).toBe('expirada');
  });
});
