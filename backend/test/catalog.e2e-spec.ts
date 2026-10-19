import { CatalogService } from '../src/modules/catalog/services/catalog.service.js';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Catálogo por HTTP con la aplicación completa (spec 004, US1). Requiere PostgreSQL.
describe('Catálogo de servicios (spec 004)', () => {
  let t: AuthTestApp;
  let auth: string;
  let catalog: CatalogService;

  beforeAll(async () => {
    t = await startAuthApp();
    const user = await t.createUser();
    auth = `Bearer ${(await t.login(user.email, user.password)).body.sessionToken as string}`;
    catalog = t.app.get(CatalogService, { strict: false });
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  beforeEach(async () => {
    await t.db.query('DELETE FROM catalog_plans');
    await t.db.query('DELETE FROM catalog_services');
  });

  async function insertService(
    slug: string,
    name: string,
    options: { category?: string; active?: boolean } = {},
  ): Promise<string> {
    const result = await t.db.query<{ id: string }>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color, is_active)
       VALUES ($1, $2, $3, 'https://logos.example/x.png', '#E50914', $4) RETURNING id`,
      [slug, name, options.category ?? 'video', options.active ?? true],
    );
    return result.rows[0]!.id;
  }

  async function insertPlan(
    serviceId: string,
    slug: string,
    options: {
      priceCents: number;
      currency?: string;
      maxSlots?: number;
      individual?: number | null;
      active?: boolean;
    },
  ): Promise<void> {
    await t.db.query(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                  individual_price_cents, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        serviceId,
        slug,
        `Plan ${slug}`,
        options.priceCents,
        options.currency ?? 'USD',
        options.maxSlots ?? 4,
        options.individual ?? null,
        options.active ?? true,
      ],
    );
  }

  const get = (url: string, session = auth) => t.http().get(url).set('Authorization', session);

  it('CA-004-09: sin sesión el catálogo responde 401', async () => {
    for (const url of ['/catalog/services/netflix', '/catalog/categories']) {
      const res = await t.http().get(url);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('CA-004-01: solo se ofrecen servicios activos con al menos un plan activo', async () => {
    const offered = await insertService('netflix', 'Netflix');
    await insertPlan(offered, 'netflix-basico', { priceCents: 1000 });
    const inactive = await insertService('hbo', 'HBO', { active: false });
    await insertPlan(inactive, 'hbo-plan', { priceCents: 1000 });
    const noPlans = await insertService('sin-planes', 'Sin planes');
    const onlyInactivePlan = await insertService('apagado', 'Apagado');
    await insertPlan(onlyInactivePlan, 'apagado-plan', { priceCents: 1000, active: false });
    expect(noPlans).toBeDefined();

    const page = await catalog.listServices({});
    expect(page.items.map((s) => s.slug)).toEqual(['netflix']);
    const categories = await get('/catalog/categories');
    expect(categories.status).toBe(200);
    const total = (categories.body.items as { servicesCount: number }[]).reduce(
      (sum, c) => sum + c.servicesCount,
      0,
    );
    expect(total).toBe(1);
  });

  it('CA-004-04: el detalle trae solo los planes activos ordenados por precio', async () => {
    const id = await insertService('spotify', 'Spotify', { category: 'musica' });
    await insertPlan(id, 'spotify-familiar', { priceCents: 1699, maxSlots: 6 });
    await insertPlan(id, 'spotify-duo', { priceCents: 1299, maxSlots: 2 });
    await insertPlan(id, 'spotify-viejo', { priceCents: 100, active: false });

    const res = await get('/catalog/services/spotify');
    expect(res.status).toBe(200);
    expect(res.body.service).toMatchObject({
      slug: 'spotify',
      name: 'Spotify',
      category: 'musica',
      categoryLabel: 'Música',
      logoUrl: 'https://logos.example/x.png',
      brandColor: '#E50914',
    });
    expect(res.body.plans.map((p: { slug: string }) => p.slug)).toEqual([
      'spotify-duo',
      'spotify-familiar',
    ]);
  });

  it('CA-004-04: un servicio inexistente, inactivo o sin planes activos responde 404', async () => {
    const inactive = await insertService('hbo', 'HBO', { active: false });
    await insertPlan(inactive, 'hbo-plan', { priceCents: 1000 });
    const noPlans = await insertService('sin-planes', 'Sin planes');
    await insertPlan(noPlans, 'sin-planes-viejo', { priceCents: 1000, active: false });
    for (const slug of ['no-existe', 'hbo', 'sin-planes']) {
      const res = await get(`/catalog/services/${slug}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
  });

  it('CA-004-11: el precio individual está presente o es null', async () => {
    const id = await insertService('disney', 'Disney+');
    await insertPlan(id, 'disney-con-dato', { priceCents: 1500, individual: 800 });
    await insertPlan(id, 'disney-sin-dato', { priceCents: 1600, individual: null });
    const res = await get('/catalog/services/disney');
    const bySlug = Object.fromEntries(
      (res.body.plans as { slug: string; individualPriceCents: number | null }[]).map((p) => [
        p.slug,
        p.individualPriceCents,
      ]),
    );
    expect(bySlug['disney-con-dato']).toBe(800);
    expect(bySlug['disney-sin-dato']).toBeNull();
  });

  it('RN-004-05, CA-004-08: getActivePlanForSubscription trae los campos de copia o null si está inactivo', async () => {
    const id = await insertService('netflix', 'Netflix');
    await insertPlan(id, 'netflix-premium', {
      priceCents: 1999,
      currency: 'USD',
      maxSlots: 4,
      individual: 2299,
    });
    await insertPlan(id, 'netflix-sin-dato', { priceCents: 999, individual: null });
    await insertPlan(id, 'netflix-apagado', { priceCents: 500, active: false });
    const off = await insertService('apagado', 'Apagado', { active: false });
    await insertPlan(off, 'apagado-plan', { priceCents: 500 });

    expect(await catalog.getActivePlanForSubscription('netflix-premium')).toEqual({
      plan: expect.objectContaining({
        slug: 'netflix-premium',
        name: 'Plan netflix-premium',
        priceCents: 1999,
        currency: 'USD',
        maxSlots: 4,
        individualPriceCents: 2299,
        individualPriceCurrency: 'USD',
      }),
      service: expect.objectContaining({
        slug: 'netflix',
        name: 'Netflix',
        logoUrl: 'https://logos.example/x.png',
        brandColor: '#E50914',
      }),
    });
    const noIndividual = await catalog.getActivePlanForSubscription('netflix-sin-dato');
    expect(noIndividual?.plan.individualPriceCents).toBeNull();
    expect(noIndividual?.plan.individualPriceCurrency).toBeNull();
    expect(await catalog.getActivePlanForSubscription('netflix-apagado')).toBeNull();
    expect(await catalog.getActivePlanForSubscription('apagado-plan')).toBeNull();
    expect(await catalog.getActivePlanForSubscription('no-existe')).toBeNull();
  });

  it('RF-004-03: las categorías son las seis de la lista cerrada con su conteo', async () => {
    const id = await insertService('spotify', 'Spotify', { category: 'musica' });
    await insertPlan(id, 'spotify-duo', { priceCents: 1299 });
    const res = await get('/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { value: string }) => c.value)).toEqual([
      'video',
      'musica',
      'juegos',
      'educacion',
      'almacenamiento',
      'otras',
    ]);
    expect(res.body.items.find((c: { value: string }) => c.value === 'musica')).toEqual({
      value: 'musica',
      label: 'Música',
      servicesCount: 1,
    });
  });
});
