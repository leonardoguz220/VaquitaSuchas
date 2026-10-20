import { randomUUID } from 'node:crypto';
import { NotificationService } from '../src/modules/notifications/services/notification.service.js';
import { DbService } from '../src/shared/db/db.service.js';
import { startAuthApp, type AuthTestApp, type TestUser } from './support/auth-app.js';

// Spec 005, parte A: centro de notificaciones dentro de la app. Requiere PostgreSQL.
describe('Notificaciones: lista, contador y lectura (spec 005)', () => {
  let t: AuthTestApp;
  let ana: TestUser;
  let beto: TestUser;
  let anaAuth: string;
  let betoAuth: string;
  let seq = 0;

  beforeAll(async () => {
    t = await startAuthApp();
    ana = await t.createUser();
    beto = await t.createUser();
    anaAuth = `Bearer ${(await t.login(ana.email, ana.password)).body.sessionToken as string}`;
    betoAuth = `Bearer ${(await t.login(beto.email, beto.password)).body.sessionToken as string}`;
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);
  beforeEach(async () => {
    await t.db.query('DELETE FROM notification_deliveries');
    await t.db.query('DELETE FROM notifications');
  });

  async function insert(
    userId: string,
    opts: { title?: string; createdAt?: string; read?: boolean } = {},
  ): Promise<string> {
    seq += 1;
    const result = await t.db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, category, title, body, link, dedupe_key,
                                  created_at, read_at)
       VALUES ($1, 'cobro_generado', 'recordatorios', $2, 'Cuerpo', '/cobros/x', $3,
               COALESCE($4::timestamptz, now()), CASE WHEN $5 THEN now() END)
       RETURNING id`,
      [
        userId,
        opts.title ?? `Aviso ${seq}`,
        `test-${seq}`,
        opts.createdAt ?? null,
        opts.read ?? false,
      ],
    );
    return result.rows[0]!.id;
  }

  const get = (url: string, auth = anaAuth) => t.http().get(url).set('Authorization', auth);
  const post = (url: string, auth = anaAuth) => t.http().post(url).set('Authorization', auth);

  it('CA-005-21: sin sesión responde 401', async () => {
    expect((await t.http().get('/notifications')).status).toBe(401);
    expect((await t.http().get('/notifications/unread-count')).status).toBe(401);
    expect((await t.http().post('/notifications/read-all')).status).toBe(401);
  });

  it('CA-005-21: cada persona ve solo sus notificaciones', async () => {
    await insert(ana.id, { title: 'De Ana' });
    await insert(beto.id, { title: 'De Beto 1' });
    await insert(beto.id, { title: 'De Beto 2' });

    const mine = await get('/notifications');
    expect(mine.status).toBe(200);
    expect((mine.body.items as { title: string }[]).map((i) => i.title)).toEqual(['De Ana']);
    expect(mine.body.unreadCount).toBe(1);
    expect(mine.body.nextCursor).toBeNull();
    expect(mine.body.items[0]).toEqual(
      expect.objectContaining({
        type: 'cobro_generado',
        category: 'recordatorios',
        body: 'Cuerpo',
        link: '/cobros/x',
        readAt: null,
      }),
    );
    expect(typeof mine.body.items[0].createdAt).toBe('string');
    expect(Object.keys(mine.body.items[0])).not.toContain('userId');

    const theirs = await get('/notifications', betoAuth);
    expect(theirs.body.items).toHaveLength(2);
    expect(theirs.body.unreadCount).toBe(2);
  });

  it('CA-005-21: marcar como leída una notificación ajena responde 404 y no la cambia', async () => {
    const betoId = await insert(beto.id);
    expect((await post(`/notifications/${betoId}/read`)).status).toBe(404);
    expect((await post(`/notifications/${randomUUID()}/read`)).status).toBe(404);
    expect((await post('/notifications/no-es-un-uuid/read')).status).toBe(404);
    const row = await t.db.query('SELECT read_at FROM notifications WHERE id = $1', [betoId]);
    expect(row.rows[0].read_at).toBeNull();
  });

  it('CA-005-22: marcar una como leída baja el contador y es idempotente', async () => {
    const first = await insert(ana.id);
    await insert(ana.id);
    expect((await get('/notifications/unread-count')).body).toEqual({ unreadCount: 2 });

    const res = await post(`/notifications/${first}/read`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await get('/notifications/unread-count')).body).toEqual({ unreadCount: 1 });

    const readAt = (await t.db.query('SELECT read_at FROM notifications WHERE id = $1', [first]))
      .rows[0].read_at as Date;
    expect((await post(`/notifications/${first}/read`)).status).toBe(204);
    const again = (await t.db.query('SELECT read_at FROM notifications WHERE id = $1', [first]))
      .rows[0].read_at as Date;
    expect(again.getTime()).toBe(readAt.getTime());
    expect((await get('/notifications/unread-count')).body).toEqual({ unreadCount: 1 });
  });

  it('CA-005-22: marcar todas como leídas deja el contador en 0 sin tocar las de otra persona', async () => {
    await insert(ana.id);
    await insert(ana.id);
    await insert(ana.id, { read: true });
    await insert(beto.id);

    const res = await post('/notifications/read-all');
    expect(res.status).toBe(204);
    expect((await get('/notifications/unread-count')).body).toEqual({ unreadCount: 0 });
    const all = await get('/notifications');
    expect(all.body.items).toHaveLength(3);
    expect((all.body.items as { readAt: string | null }[]).every((i) => i.readAt !== null)).toBe(
      true,
    );
    expect((await get('/notifications/unread-count', betoAuth)).body).toEqual({ unreadCount: 1 });
  });

  it('RF-005-02: el filtro unread devuelve solo las no leídas y el contador cuenta todas', async () => {
    await insert(ana.id, { title: 'Nueva' });
    await insert(ana.id, { title: 'Vieja', read: true });

    const unread = await get('/notifications?unread=true');
    expect((unread.body.items as { title: string }[]).map((i) => i.title)).toEqual(['Nueva']);
    expect(unread.body.unreadCount).toBe(1);
    expect((await get('/notifications?unread=false')).body.items).toHaveLength(2);
    expect((await get('/notifications?unread=quizas')).status).toBe(400);
  });

  it('RF-005-01: pagina por cursor, de la más reciente a la más antigua, sin repetir ni saltar', async () => {
    const sameInstant = '2026-10-10T12:00:00.500000Z';
    const ids = [
      await insert(ana.id, { title: 'n1', createdAt: '2026-10-01T12:00:00Z' }),
      await insert(ana.id, { title: 'n2', createdAt: sameInstant }),
      await insert(ana.id, { title: 'n3', createdAt: sameInstant }),
      await insert(ana.id, { title: 'n4', createdAt: sameInstant }),
      await insert(ana.id, { title: 'n5', createdAt: '2026-10-15T12:00:00Z' }),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: {
        status: number;
        body: { items: { id: string }[]; nextCursor: string | null; unreadCount: number };
      } = await get(`/notifications?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(5);
      seen.push(...res.body.items.map((i) => i.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    // Más reciente primero; los tres con el mismo instante se desempatan por id descendente.
    expect(seen[0]).toBe(ids[4]);
    expect(seen[4]).toBe(ids[0]);
    expect(seen.slice(1, 4)).toEqual([ids[1]!, ids[2]!, ids[3]!].sort().reverse());
  });

  it('RF-005-01: un cursor inválido o un límite fuera de rango responde 400', async () => {
    expect((await get('/notifications?cursor=basura')).status).toBe(400);
    expect((await get('/notifications?limit=0')).status).toBe(400);
    expect((await get('/notifications?limit=101')).status).toBe(400);
    expect((await get('/notifications?limit=abc')).status).toBe(400);
  });

  it('RNF-005-01: notify crea el aviso una sola vez aunque se repita el hecho', async () => {
    const notifications = t.app.get(NotificationService);
    const db = t.app.get(DbService);
    const entity = { type: 'charge', id: randomUUID() };
    const input = {
      userId: ana.id,
      type: 'cobro_generado' as const,
      entity,
      data: {
        groupName: 'Netflix Familia',
        amountCents: 2550,
        dueAt: new Date('2026-11-16T02:00:00Z'),
        chargeId: entity.id,
      },
    };

    expect(await db.withTransaction((tx) => notifications.notify(tx, input))).toBe(true);
    expect(await db.withTransaction((tx) => notifications.notify(tx, input))).toBe(false);
    // Otra persona avisada por la misma entidad sí recibe el suyo.
    expect(
      await db.withTransaction((tx) => notifications.notify(tx, { ...input, userId: beto.id })),
    ).toBe(true);

    const mine = await get('/notifications');
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toEqual(
      expect.objectContaining({
        type: 'cobro_generado',
        category: 'recordatorios',
        link: `/cobros/${entity.id}`,
      }),
    );
    expect(mine.body.items[0].body).toContain('Bs 25,50');
    expect(mine.body.unreadCount).toBe(1);
  });

  it('RNF-005-01: si la transacción del hecho se revierte, el aviso también', async () => {
    const notifications = t.app.get(NotificationService);
    const db = t.app.get(DbService);
    const entity = { type: 'charge', id: randomUUID() };
    await expect(
      db.withTransaction(async (tx) => {
        await notifications.notify(tx, {
          userId: ana.id,
          type: 'pago_confirmado',
          entity,
          data: { groupName: 'Spotify', amountCents: 1000, chargeId: entity.id },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await get('/notifications/unread-count')).body).toEqual({ unreadCount: 0 });
  });

  it('RN-005-02: cancelForEntity salta los envíos pendientes del cobro y deja los demás', async () => {
    const notifications = t.app.get(NotificationService);
    const db = t.app.get(DbService);
    const charge = { type: 'charge', id: randomUUID() };
    const other = { type: 'charge', id: randomUUID() };
    const make = async (
      entity: { type: string; id: string },
      type: 'recordatorio_vencimiento' | 'cobro_generado',
    ) =>
      db.withTransaction((tx) =>
        notifications.notify(tx, {
          userId: ana.id,
          type,
          entity,
          data: { groupName: 'G', amountCents: 500, dueAt: new Date(), chargeId: entity.id },
        }),
      );
    await make(charge, 'recordatorio_vencimiento');
    await make(charge, 'cobro_generado');
    await make(other, 'recordatorio_vencimiento');
    // `notify` ya crea el envío de correo pendiente de cada aviso (T020): no hace falta insertarlo.
    const pending = await t.db.query(
      "SELECT 1 FROM notification_deliveries WHERE status = 'pending' AND channel = 'email'",
    );
    expect(pending.rowCount).toBe(3);

    const cancelled = await db.withTransaction((tx) =>
      notifications.cancelForEntity(tx, 'charge', charge.id, ['recordatorio_vencimiento']),
    );
    // Un envío de correo y uno de Telegram del mismo aviso.
    expect(cancelled).toBe(2);

    const rows = await t.db.query<{
      type: string;
      entity_id: string;
      status: string;
      skip_reason: string | null;
    }>(
      `SELECT n.type, n.entity_id, d.status, d.skip_reason
         FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id`,
    );
    const skipped = rows.rows.filter((r) => r.status === 'skipped');
    expect(skipped).toHaveLength(2);
    for (const row of skipped) {
      expect(row).toMatchObject({
        type: 'recordatorio_vencimiento',
        entity_id: charge.id,
        skip_reason: 'aviso_cancelado',
      });
    }
    expect(rows.rows.filter((r) => r.status === 'pending')).toHaveLength(4);
  });

  it('CA-005-21: con 1.000 registros la lista y el contador responden en menos de 300 ms', async () => {
    await t.db.query(
      `INSERT INTO notifications (user_id, type, category, title, body, link, dedupe_key, created_at)
       SELECT $1, 'cobro_generado', 'recordatorios', 'Aviso ' || n, 'Cuerpo', '/cobros/x',
              'perf-' || n, now() - (n || ' seconds')::interval
         FROM generate_series(1, 1000) AS n`,
      [ana.id],
    );
    await t.db.query('ANALYZE notifications');
    await get('/notifications?limit=20'); // calienta la conexión y el plan

    const started = performance.now();
    const list = await get('/notifications?limit=20');
    const listMs = performance.now() - started;
    const countStart = performance.now();
    const count = await get('/notifications/unread-count');
    const countMs = performance.now() - countStart;

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(20);
    expect(list.body.unreadCount).toBe(1000);
    expect(count.body).toEqual({ unreadCount: 1000 });
    expect(listMs).toBeLessThan(300);
    expect(countMs).toBeLessThan(300);
  });
});
