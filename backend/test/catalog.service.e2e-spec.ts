import { CatalogModule } from '../src/modules/catalog/catalog.module.js';
import { CatalogService } from '../src/modules/catalog/services/catalog.service.js';
import { DomainError } from '../src/shared/errors/domain-error.js';
import { BillingHarness } from './support/billing-harness.js';

// Spec 004 T009: CatalogService contra PostgreSQL real (CA-004-04, CA-004-08). Las pruebas HTTP
// del catálogo (T006) las escribe otra tarea.
describe('CatalogService', () => {
  const harness = new BillingHarness({ imports: [CatalogModule] });
  let catalog: CatalogService;

  beforeAll(async () => {
    await harness.start();
    catalog = harness.app.get(CatalogService, { strict: false });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  beforeEach(async () => {
    await harness.pool.query('DELETE FROM catalog_plans');
    await harness.pool.query('DELETE FROM catalog_services');
  });

  async function insertService(
    slug: string,
    name: string,
    options: { category?: string; active?: boolean } = {},
  ): Promise<string> {
    const result = await harness.pool.query<{ id: string }>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color, is_active)
       VALUES ($1, $2, $3, 'https://logos.example/x.png', '#E50914', $4) RETURNING id`,
      [slug, name, options.category ?? 'video', options.active ?? true],
    );
    return (result.rows[0] as { id: string }).id;
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
    await harness.pool.query(
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

  async function notFound(promise: Promise<unknown>): Promise<void> {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).httpStatus).toBe(404);
    expect((error as DomainError).code).toBe('NOT_FOUND');
  }

  describe('getService', () => {
    it('CA-004-04: devuelve solo los planes activos ordenados por precio ascendente', async () => {
      const id = await insertService('netflix', 'Netflix');
      await insertPlan(id, 'netflix-premium', { priceCents: 2299 });
      await insertPlan(id, 'netflix-basico', { priceCents: 799 });
      await insertPlan(id, 'netflix-viejo', { priceCents: 100, active: false });

      const { service, plans } = await catalog.getService('netflix');

      expect(service).toMatchObject({ slug: 'netflix', category: 'video', categoryLabel: 'Video' });
      expect(plans.map((p) => p.slug)).toEqual(['netflix-basico', 'netflix-premium']);
      expect(plans[0]).toMatchObject({ priceCents: 799, currency: 'USD', maxSlots: 4 });
    });

    it('CA-004-04: un servicio inexistente, inactivo o sin planes activos responde 404', async () => {
      const inactive = await insertService('hbo', 'HBO', { active: false });
      await insertPlan(inactive, 'hbo-1', { priceCents: 500 });
      const noPlans = await insertService('vacio', 'Vacío');
      await insertPlan(noPlans, 'vacio-1', { priceCents: 500, active: false });

      await notFound(catalog.getService('no-existe'));
      await notFound(catalog.getService('hbo'));
      await notFound(catalog.getService('vacio'));
    });
  });

  describe('getActivePlanForSubscription', () => {
    it('CA-004-08: devuelve el plan con los campos de copia del servicio', async () => {
      const id = await insertService('spotify', 'Spotify', { category: 'musica' });
      await insertPlan(id, 'spotify-familiar', { priceCents: 1699, maxSlots: 6, individual: 999 });

      const result = await catalog.getActivePlanForSubscription('spotify-familiar');

      expect(result).toMatchObject({
        service: {
          slug: 'spotify',
          name: 'Spotify',
          logoUrl: 'https://logos.example/x.png',
          brandColor: '#E50914',
        },
        plan: {
          slug: 'spotify-familiar',
          name: 'Plan spotify-familiar',
          priceCents: 1699,
          currency: 'USD',
          maxSlots: 6,
          individualPriceCents: 999,
          individualPriceCurrency: 'USD',
        },
      });
    });

    it('CA-004-11: sin precio individual, el precio y su moneda son null', async () => {
      const id = await insertService('max', 'Max');
      await insertPlan(id, 'max-1', { priceCents: 900, currency: 'BS' });

      const result = await catalog.getActivePlanForSubscription('max-1');

      expect(result?.plan.individualPriceCents).toBeNull();
      expect(result?.plan.individualPriceCurrency).toBeNull();
    });

    it('CA-004-08: devuelve null si el plan está inactivo', async () => {
      const id = await insertService('disney', 'Disney+');
      await insertPlan(id, 'disney-1', { priceCents: 900, active: false });
      expect(await catalog.getActivePlanForSubscription('disney-1')).toBeNull();
    });

    it('CA-004-08: devuelve null si el servicio está inactivo aunque el plan esté activo', async () => {
      const id = await insertService('prime', 'Prime Video', { active: false });
      await insertPlan(id, 'prime-1', { priceCents: 900 });
      expect(await catalog.getActivePlanForSubscription('prime-1')).toBeNull();
    });

    it('CA-004-08: devuelve null si el plan no existe', async () => {
      expect(await catalog.getActivePlanForSubscription('no-existe')).toBeNull();
    });
  });

  describe('listado', () => {
    it('CA-004-01: lista alfabéticamente solo servicios activos con plan activo, paginando por cursor', async () => {
      const a = await insertService('a-uno', 'Alfa');
      await insertPlan(a, 'a-uno-1', { priceCents: 900 });
      await insertPlan(a, 'a-uno-2', { priceCents: 500 });
      const b = await insertService('b-dos', 'Beta', { category: 'musica' });
      await insertPlan(b, 'b-dos-1', { priceCents: 700 });
      const c = await insertService('c-tres', 'Gama');
      await insertPlan(c, 'c-tres-1', { priceCents: 300 });
      const sinPlanes = await insertService('d-cuatro', 'Delta');
      await insertPlan(sinPlanes, 'd-cuatro-1', { priceCents: 300, active: false });
      const inactivo = await insertService('e-cinco', 'Épsilon', { active: false });
      await insertPlan(inactivo, 'e-cinco-1', { priceCents: 300 });

      const first = await catalog.listServices({ limit: 2 });
      expect(first.items.map((s) => s.name)).toEqual(['Alfa', 'Beta']);
      expect(first.items[0]).toMatchObject({
        fromPriceCents: 500,
        fromCurrency: 'USD',
        plansCount: 2,
      });
      expect(first.nextCursor).not.toBeNull();

      const second = await catalog.listServices({ limit: 2, cursor: first.nextCursor });
      expect(second.items.map((s) => s.name)).toEqual(['Gama']);
      expect(second.nextCursor).toBeNull();

      const music = await catalog.listServices({ category: 'musica' });
      expect(music.items.map((s) => s.slug)).toEqual(['b-dos']);
    });

    it('RF-004-03: las categorías traen cuántos servicios ofrecidos tiene cada una', async () => {
      const a = await insertService('a-uno', 'Alfa', { category: 'juegos' });
      await insertPlan(a, 'a-uno-1', { priceCents: 900 });

      const { items } = await catalog.listCategories();

      expect(items).toHaveLength(6);
      expect(items.find((c) => c.value === 'juegos')).toEqual({
        value: 'juegos',
        label: 'Juegos',
        servicesCount: 1,
      });
      expect(items.find((c) => c.value === 'video')?.servicesCount).toBe(0);
    });

    it('RF-004-02: un cursor mal formado es VALIDATION_ERROR', async () => {
      await expect(catalog.listServices({ cursor: 'basura' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
      });
    });
  });
});
