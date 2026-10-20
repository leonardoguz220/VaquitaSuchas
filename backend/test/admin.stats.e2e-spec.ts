import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { asAdmin, createAdmin, insertGroup, type AdminActor } from './support/admin-fixtures.js';

// Spec 009, US7: estadísticas agregadas (RF-009-15 a 17). Requiere PostgreSQL.
describe('Estadísticas de la plataforma (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;
  let victim: { id: string; email: string };

  const count = async (sql: string): Promise<number> =>
    Number((await t.db.query<{ n: string }>(sql)).rows[0]?.n);

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
    victim = await t.createUser();
    await insertGroup(t, victim.id);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-16: los totales por estado coinciden con la base', async () => {
    const res = await asAdmin(t, admin, 'get', '/admin/stats');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.users.total).toBe(await count('SELECT count(*) AS n FROM users'));
    expect(res.body.groups).toEqual({
      active: await count(`SELECT count(*) AS n FROM groups WHERE status = 'activo'`),
      closed: await count(`SELECT count(*) AS n FROM groups WHERE status = 'cerrado'`),
    });
    const byStatus = res.body.charges.byStatus as Record<string, number>;
    for (const status of ['pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado']) {
      expect(byStatus[status]).toBe(
        await count(
          `SELECT count(*) AS n FROM charges WHERE status = '${status}' AND period = '${res.body.charges.period as string}'`,
        ),
      );
    }
    expect(res.body.disputesOpen).toBe(
      await count(`SELECT count(*) AS n FROM join_disputes WHERE status = 'abierto'`),
    );
    expect(res.body.listings.active).toBe(
      await count(`SELECT count(*) AS n FROM listings WHERE status = 'activa'`),
    );
  });

  it('CA-009-17: solo agregados, sin personas ni detalle de cobros', async () => {
    const res = await asAdmin(t, admin, 'get', '/admin/stats');

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(victim.email);
    expect(text).not.toContain(victim.id);
    expect(text).not.toMatch(/comprobante|receipt|phone|password|@/i);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'charges',
        'disputesOpen',
        'groups',
        'joinRequestsThisMonth',
        'listings',
        'punctualityRate',
        'topServices',
        'users',
      ].sort(),
    );
  });

  it('un usuario normal recibe 403 y el resultado se cachea hasta 5 minutos', async () => {
    const user = await t.createUser();
    const login = await t.login(user.email, user.password ?? '');
    const forbidden = await t
      .http()
      .get('/admin/stats')
      .set('Authorization', `Bearer ${login.body.sessionToken as string}`);
    expect(forbidden.status).toBe(403);

    const before = await asAdmin(t, admin, 'get', '/admin/stats');
    await t.createUser();
    const after = await asAdmin(t, admin, 'get', '/admin/stats');
    expect(after.body.users.total).toBe(before.body.users.total);
  });
});
