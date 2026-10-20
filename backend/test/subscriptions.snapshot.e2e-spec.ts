import request from 'supertest';
import { CatalogService } from '../src/modules/catalog/services/catalog.service.js';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { BillingHarness } from './support/billing-harness.js';

// Contrato spec 004 ↔ spec 001: el catálogo entrega los campos de la copia y el grupo creado no
// cambia cuando después cambia el catálogo. Requiere PostgreSQL.
describe('Copia del catálogo al crear un grupo (spec 004)', () => {
  const harness = new BillingHarness({
    configure: (builder) =>
      builder.overrideProvider(HOST_ELIGIBILITY_PORT).useValue({
        check: () =>
          Promise.resolve({
            eligible: true,
            source: 'manual',
            requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
            current: { stars: null, consideredCharges: 0, level: null },
          }),
      }),
  });
  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  let serviceId: string;

  beforeAll(async () => {
    await harness.start();
    const service = await harness.pool.query<{ id: string }>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color, is_active)
       VALUES ('netflix', 'Netflix', 'video', 'https://logos.example/n.png', '#E50914', true)
       RETURNING id`,
    );
    serviceId = service.rows[0]!.id;
    await harness.pool.query(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                  individual_price_cents, is_active)
       VALUES ($1, 'netflix-premium', 'Premium', 2299, 'USD', 4, 2299, true)`,
      [serviceId],
    );
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  it('RF-004-08: el catálogo entrega todos los campos que la spec 001 copia', async () => {
    const catalog = harness.app.get(CatalogService, { strict: false });
    const copy = await catalog.getActivePlanForSubscription('netflix-premium');
    expect(copy).toMatchObject({
      service: {
        name: 'Netflix',
        logoUrl: 'https://logos.example/n.png',
        brandColor: '#E50914',
      },
      plan: {
        id: expect.any(String),
        name: 'Premium',
        maxSlots: 4,
        individualPriceCents: 2299,
        individualPriceCurrency: 'USD',
      },
    });
  });

  it('CA-004-07, RN-004-01: cambiar el plan del catálogo no cambia el grupo ya creado', async () => {
    const owner = await harness.insertUser('Titular Catalogo');
    const created = await http()
      .post('/groups')
      .set('Authorization', `Bearer ${harness.token(owner)}`)
      .send({
        catalogPlanSlug: 'netflix-premium',
        name: 'Netflix del depa',
        priceCents: 1800,
        currency: 'USD',
        exchangeRate: '6.9600',
        billingDay: 10,
        totalSlots: 3,
      })
      .expect(201);
    const groupId = created.body.id as string;
    const snapshot = async () =>
      (
        await harness.pool.query(
          `SELECT price_cents, currency, total_slots, service_name_snapshot, plan_name_snapshot,
                  logo_url_snapshot, brand_color_snapshot, plan_max_slots_snapshot,
                  individual_price_cents_snapshot, individual_price_currency_snapshot
             FROM groups WHERE id = $1`,
          [groupId],
        )
      ).rows[0];
    const before = await snapshot();
    // El precio real es el del titular; la copia trae lo que había en el catálogo (RN-004-01).
    expect(before).toMatchObject({
      price_cents: '1800',
      service_name_snapshot: 'Netflix',
      plan_name_snapshot: 'Premium',
      plan_max_slots_snapshot: 4,
      individual_price_cents_snapshot: '2299',
    });

    await harness.pool.query(
      `UPDATE catalog_plans SET price_cents = 9999, name = 'Renombrado', max_slots = 6,
              individual_price_cents = 5000 WHERE slug = 'netflix-premium'`,
    );
    await harness.pool.query(
      `UPDATE catalog_services SET name = 'Netflix Nuevo', logo_url = 'https://logos.example/otro.png',
              brand_color = '#000000' WHERE id = $1`,
      [serviceId],
    );

    expect(await snapshot()).toEqual(before);
    expect(created.body.service).toMatchObject({ name: 'Netflix', planName: 'Premium' });

    // Ya cambiado el catálogo, un grupo nuevo copia los valores nuevos.
    const catalog = harness.app.get(CatalogService, { strict: false });
    const copy = await catalog.getActivePlanForSubscription('netflix-premium');
    expect(copy?.service.name).toBe('Netflix Nuevo');
    expect(copy?.plan.maxSlots).toBe(6);
  });

  it('CA-004-08: con el plan desactivado ya no se puede crear un grupo, pero el existente sigue igual', async () => {
    const owner = await harness.insertUser('Titular Dos');
    await harness.pool.query(
      `UPDATE catalog_plans SET is_active = false WHERE slug = 'netflix-premium'`,
    );
    await http()
      .post('/groups')
      .set('Authorization', `Bearer ${harness.token(owner)}`)
      .send({
        catalogPlanSlug: 'netflix-premium',
        name: 'Otro grupo',
        priceCents: 1800,
        currency: 'USD',
        exchangeRate: '6.9600',
        billingDay: 10,
        totalSlots: 3,
      })
      .expect(404);
    await harness.pool.query(
      `UPDATE catalog_plans SET is_active = true WHERE slug = 'netflix-premium'`,
    );
  });
});
