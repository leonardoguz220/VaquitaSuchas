import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// RNF-004-01: listar y buscar con 200 servicios responde en menos de 300 ms. Requiere PostgreSQL.
describe('Rendimiento del catálogo (spec 004)', () => {
  let t: AuthTestApp;
  let auth: string;

  beforeAll(async () => {
    t = await startAuthApp();
    const user = await t.createUser();
    auth = `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
    await t.db.query('DELETE FROM catalog_plans');
    await t.db.query('DELETE FROM catalog_services');
    const categories = ['video', 'musica', 'juegos', 'educacion', 'almacenamiento', 'otras'];
    await t.db.query(
      `INSERT INTO catalog_services (slug, name, category, is_active)
       SELECT 'servicio-' || n, 'Servicio ' || lpad(n::text, 3, '0'), ($1::text[])[1 + n % 6], true
         FROM generate_series(1, 200) AS n`,
      [categories],
    );
    await t.db.query(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots)
       SELECT s.id, s.slug || '-' || k, 'Plan ' || k, 500 * k, 'USD', 4
         FROM catalog_services s CROSS JOIN generate_series(1, 3) AS k`,
    );
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  async function timed(url: string): Promise<{ ms: number; count: number }> {
    const started = performance.now();
    const res = await t.http().get(url).set('Authorization', auth);
    const ms = performance.now() - started;
    expect(res.status).toBe(200);
    return { ms, count: (res.body.items as unknown[]).length };
  }

  it('RNF-004-01: listar con 200 servicios responde en menos de 300 ms', async () => {
    await timed('/catalog/services?limit=50'); // calienta la conexión y el plan
    const { ms, count } = await timed('/catalog/services?limit=50');
    expect(count).toBe(50);
    expect(ms).toBeLessThan(300);
  });

  it('RNF-004-01: buscar y filtrar con 200 servicios responde en menos de 300 ms', async () => {
    await timed('/catalog/services?q=servicio');
    const search = await timed('/catalog/services?q=servicio%201&limit=50');
    const filtered = await timed('/catalog/services?category=musica&q=servicio');
    expect(search.count).toBeGreaterThan(0);
    expect(filtered.count).toBeGreaterThan(0);
    expect(search.ms).toBeLessThan(300);
    expect(filtered.ms).toBeLessThan(300);
  });
});
