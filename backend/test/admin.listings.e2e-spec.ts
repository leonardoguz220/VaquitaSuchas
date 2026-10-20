import { randomUUID } from 'node:crypto';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import {
  asAdmin,
  createAdmin,
  insertGroup,
  spyOnMail,
  type AdminActor,
} from './support/admin-fixtures.js';

const REASON = 'Publicación con datos falsos confirmados';

// Spec 009, US6: moderación de publicaciones (RF-009-12 a 14; CA-009-14, 15). Requiere PostgreSQL.
describe('Moderación de publicaciones (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const decide = (listingId: string, action: string, body: object = { reason: REASON }) =>
    asAdmin(t, admin, 'post', `/admin/listings/${listingId}/${action}`).send(body);
  const auditOf = async (listingId: string) =>
    (
      await t.db.query<{ action: string; reason: string | null; admin_id: string }>(
        'SELECT action, reason, admin_id FROM admin_audit_log WHERE target_id = $1 ORDER BY occurred_at, id',
        [listingId],
      )
    ).rows;
  const statusOf = async (listingId: string) =>
    (
      await t.db.query<{ status: string; end_reason: string | null }>(
        'SELECT status, end_reason FROM listings WHERE id = $1',
        [listingId],
      )
    ).rows[0];

  /** Publicación de un titular nuevo, con `reports` reportes y, si se pide, oculta. */
  async function seed(options: { reports?: number; hidden?: boolean } = {}) {
    const owner = await t.createUser();
    const groupId = await insertGroup(t, owner.id);
    const listing = await t.db.query<{ id: string }>(
      `INSERT INTO listings (group_id, slots_offered, description, published_at, expires_at)
       VALUES ($1, 2, 'Cupos disponibles', now(), now() + interval '30 days') RETURNING id`,
      [groupId],
    );
    const listingId = (listing.rows[0] as { id: string }).id;
    for (let i = 0; i < (options.reports ?? 0); i++) {
      const reporter = await t.createUser();
      await t.db.query(
        `INSERT INTO listing_reports (listing_id, reporter_id, reason, comment) VALUES ($1, $2, 'spam', $3)`,
        [listingId, reporter.id, `Comentario ${i}`],
      );
    }
    if (options.hidden) {
      await t.db.query(`UPDATE listings SET status = 'oculta', hidden_at = now() WHERE id = $1`, [
        listingId,
      ]);
    }
    return { owner, groupId, listingId };
  }

  const notificationsOf = async (userId: string) =>
    (
      await t.db.query<{ type: string; body: string }>(
        `SELECT type, body FROM notifications WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      )
    ).rows;

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('RF-009-12: la cola trae las ocultas primero, con motivos y sin quién reportó', async () => {
    const hidden = await seed({ reports: 3, hidden: true });
    const reported = await seed({ reports: 1 });
    await seed();

    const res = await asAdmin(t, admin, 'get', '/admin/listings/reports');

    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { listingId: string }) => i.listingId);
    expect(ids).toContain(hidden.listingId);
    expect(ids).toContain(reported.listingId);
    expect(ids.indexOf(hidden.listingId)).toBeLessThan(ids.indexOf(reported.listingId));
    const item = res.body.items.find(
      (i: { listingId: string }) => i.listingId === hidden.listingId,
    );
    expect(item).toMatchObject({ status: 'oculta', reportCount: 3 });
    expect(item.reports[0]).toMatchObject({ reason: 'spam', comment: 'Comentario 0' });
    expect(JSON.stringify(res.body)).not.toContain('reporter');
  });

  it('CA-009-14: restaurar una publicación oculta la devuelve a la búsqueda y queda registrado', async () => {
    const { owner, listingId } = await seed({ reports: 3, hidden: true });

    const res = await decide(listingId, 'restore');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listingId, decision: 'restore', status: 'activa' });
    const row = await t.db.query<{
      status: string;
      hidden_at: Date | null;
      moderation_cleared_at: Date | null;
    }>('SELECT status, hidden_at, moderation_cleared_at FROM listings WHERE id = $1', [listingId]);
    expect(row.rows[0]).toMatchObject({ status: 'activa', hidden_at: null });
    expect(row.rows[0]?.moderation_cleared_at).toBeInstanceOf(Date);
    expect(await auditOf(listingId)).toEqual([
      { action: 'publicacion_restaurar', reason: REASON, admin_id: admin.id },
    ]);
    // Los reportes anteriores ya no cuentan en la cola.
    const queue = await asAdmin(t, admin, 'get', '/admin/listings/reports');
    expect(queue.body.items.map((i: { listingId: string }) => i.listingId)).not.toContain(
      listingId,
    );
    expect((await notificationsOf(owner.id)).map((n) => n.type)).toEqual(['publicacion_decision']);
  });

  it('CA-009-15: eliminar con motivo cierra la publicación y notifica al titular la decisión', async () => {
    const { owner, listingId } = await seed({ reports: 3, hidden: true });

    const res = await decide(listingId, 'delete');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listingId, decision: 'delete', status: 'cerrada' });
    expect(await statusOf(listingId)).toEqual({ status: 'cerrada', end_reason: 'moderacion' });
    const notes = await notificationsOf(owner.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'publicacion_decision' });
    expect(notes[0]?.body).toContain(REASON);
    expect((await auditOf(listingId))[0]).toMatchObject({
      action: 'publicacion_eliminar',
      reason: REASON,
    });
  });

  it('RF-009-13: eliminar y suspender cierra la publicación, suspende al titular y le escribe', async () => {
    const mail = spyOnMail(t);
    const { owner, listingId } = await seed({ reports: 2 });

    const res = await decide(listingId, 'delete-and-suspend');

    expect(res.status).toBe(200);
    expect(await statusOf(listingId)).toMatchObject({ status: 'cerrada' });
    const user = await t.db.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
      owner.id,
    ]);
    expect(user.rows[0]?.status).toBe('suspendido');
    expect((await auditOf(listingId)).map((e) => e.action)).toEqual([
      'publicacion_eliminar_y_suspender',
    ]);
    const suspension = await t.db.query(
      `SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND action = 'usuario_suspender'`,
      [owner.id],
    );
    expect(suspension.rows).toHaveLength(1);
    expect(mail.sent.map((m) => m.to)).toContain(owner.email);
    mail.spy.mockRestore();
  });

  it('un titular administrador no se suspende y no se cambia nada (todo o nada)', async () => {
    const { owner, listingId } = await seed({ reports: 1 });
    await t.db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [owner.id]);

    const res = await decide(listingId, 'delete-and-suspend');

    expect(res.status).toBe(422);
    expect(await statusOf(listingId)).toMatchObject({ status: 'activa' });
    expect(await auditOf(listingId)).toEqual([]);
    expect(await notificationsOf(owner.id)).toEqual([]);
  });

  it('exige motivo de 10 a 300, estado válido, id existente y rol de administrador', async () => {
    const live = await seed({ reports: 1 });
    expect((await decide(live.listingId, 'delete', { reason: 'corto' })).status).toBe(400);
    expect((await decide(live.listingId, 'restore')).status).toBe(409);
    expect((await decide(randomUUID(), 'delete')).status).toBe(404);
    expect((await decide('no-es-uuid', 'delete')).status).toBe(404);
    const user = await t.createUser();
    const login = await t.login(user.email, user.password ?? '');
    const forbidden = await t
      .http()
      .post(`/admin/listings/${live.listingId}/delete`)
      .set('Authorization', `Bearer ${login.body.sessionToken as string}`)
      .send({ reason: REASON });
    expect(forbidden.status).toBe(403);
    await decide(live.listingId, 'delete');
    expect((await decide(live.listingId, 'delete')).status).toBe(409);
  });
});
