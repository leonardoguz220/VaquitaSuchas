import request from 'supertest';
import { HOST_ELIGIBILITY_PORT } from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import type {
  HostEligibility,
  HostEligibilityPort,
} from '../src/modules/subscriptions/ports/host-eligibility.port.js';
import { BillingHarness } from './support/billing-harness.js';

// Alta de grupos (spec 001 T012/T014): POST /groups, POST /groups/quote y GET
// /users/me/host-eligibility contra PostgreSQL real. El puerto de elegibilidad es de prueba.
class FakeHostEligibility implements HostEligibilityPort {
  readonly ineligible = new Set<string>();

  check(_q: unknown, userId: string): Promise<HostEligibility> {
    const eligible = !this.ineligible.has(userId);
    return Promise.resolve({
      eligible,
      source: eligible ? 'manual' : null,
      requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
      current: { stars: eligible ? null : 4.0, consideredCharges: eligible ? 0 : 3, level: null },
    });
  }
}

describe('Crear grupos', () => {
  const eligibility = new FakeHostEligibility();
  const harness = new BillingHarness({
    configure: (builder) => builder.overrideProvider(HOST_ELIGIBILITY_PORT).useValue(eligibility),
  });

  const http = (): ReturnType<typeof request> => request(harness.app.getHttpServer());
  const post = (userId: string, url: string, body: unknown): request.Test =>
    http()
      .post(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`)
      .send(body as object);

  const bodyBs = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    customServiceName: 'Mi servicio',
    name: 'Grupo de prueba',
    priceCents: 10001,
    currency: 'BS',
    billingDay: 15,
    totalSlots: 3,
    ...overrides,
  });

  const countGroups = async (): Promise<number> =>
    Number((await harness.pool.query('SELECT count(*) AS n FROM groups')).rows[0].n);

  async function insertCatalogPlan(
    slug: string,
    options: { maxSlots?: number; active?: boolean; serviceActive?: boolean } = {},
  ): Promise<void> {
    const service = await harness.pool.query<{ id: string }>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color, is_active)
       VALUES ($1, $2, 'video', 'https://logos.example/n.png', '#E50914', $3) RETURNING id`,
      [`svc-${slug}`, `Servicio ${slug}`, options.serviceActive ?? true],
    );
    await harness.pool.query(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                  individual_price_cents, is_active)
       VALUES ($1, $2, 'Premium', 2299, 'USD', $3, 2299, $4)`,
      [service.rows[0]?.id, slug, options.maxSlots ?? 4, options.active ?? true],
    );
  }

  beforeAll(async () => {
    await harness.start();
    await insertCatalogPlan('netflix-premium');
    await insertCatalogPlan('plan-corto', { maxSlots: 2 });
    await insertCatalogPlan('plan-inactivo', { active: false });
  }, 60_000);

  afterAll(() => harness.stop(), 30_000);

  it('RNF-001-01: sin sesión POST /groups responde 401', async () => {
    await http().post('/groups').send(bodyBs()).expect(401);
    await http().post('/groups/quote').send({}).expect(401);
    await http().get('/users/me/host-eligibility').expect(401);
  });

  it('CA-001-01: crea el grupo con el usuario como titular y primer miembro, y un código de 8', async () => {
    const owner = await harness.insertUser('Titular Uno');

    const response = await post(owner, '/groups', {
      catalogPlanSlug: 'netflix-premium',
      name: 'Netflix del depa',
      priceCents: 2299,
      currency: 'USD',
      exchangeRate: '6.9600',
      billingDay: 15,
      totalSlots: 4,
      paymentInfoText: 'Banco X, cuenta 123',
    }).expect(201);

    expect(response.body.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(response.body).toMatchObject({
      name: 'Netflix del depa',
      status: 'activo',
      myRole: 'titular',
      currency: 'USD',
      exchangeRate: '6.9600',
      service: { name: 'Servicio netflix-premium', planName: 'Premium', isCustom: false },
      breakdown: { memberCount: 1, totalBsCents: 16001 },
      paymentInfo: { text: 'Banco X, cuenta 123', qrUrl: null, configured: true },
    });
    expect(response.body.members).toHaveLength(1);
    expect(response.body.members[0]).toMatchObject({ userId: owner, role: 'titular' });

    const stored = await harness.pool.query(
      `SELECT g.*, m.role, m.left_at FROM groups g
         JOIN group_members m ON m.group_id = g.id WHERE g.id = $1`,
      [response.body.id],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      owner_id: owner,
      role: 'titular',
      left_at: null,
      invite_code: response.body.inviteCode,
      // Copia del catálogo (RN-001-12).
      service_name_snapshot: 'Servicio netflix-premium',
      plan_name_snapshot: 'Premium',
      logo_url_snapshot: 'https://logos.example/n.png',
      brand_color_snapshot: '#E50914',
      plan_max_slots_snapshot: 4,
      individual_price_cents_snapshot: '2299',
      individual_price_currency_snapshot: 'USD',
    });
    // GroupCreated generó el ciclo inicial (spec 002).
    const cycles = await harness.pool.query(
      'SELECT cycle_type FROM billing_cycles WHERE group_id = $1',
      [response.body.id],
    );
    expect(cycles.rows).toEqual([{ cycle_type: 'inicial' }]);
  });

  it('CA-001-01: un servicio personalizado no copia datos del catálogo', async () => {
    const owner = await harness.insertUser();

    const response = await post(owner, '/groups', bodyBs()).expect(201);

    expect(response.body.service).toMatchObject({
      name: 'Mi servicio',
      planName: null,
      isCustom: true,
    });
    expect(response.body.breakdown).toMatchObject({
      totalBsCents: 10001,
      baseShareCents: 10001,
      ownerShareCents: 10001,
    });
  });

  it('CA-001-02: precio en USD sin tipo de cambio es VALIDATION_ERROR y no crea nada', async () => {
    const owner = await harness.insertUser();
    const before = await countGroups();

    const response = await post(owner, '/groups', bodyBs({ currency: 'USD' })).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(response.body.details.fields.exchangeRate).toEqual(['EXCHANGE_RATE_REQUIRED']);
    expect(await countGroups()).toBe(before);
  });

  it('CA-001-03: precio en BS no admite tipo de cambio y no se guarda ninguno', async () => {
    const owner = await harness.insertUser();

    const rejected = await post(owner, '/groups', bodyBs({ exchangeRate: '6.96' })).expect(400);
    expect(rejected.body.details.fields.exchangeRate).toEqual(['EXCHANGE_RATE_NOT_ALLOWED']);

    const created = await post(owner, '/groups', bodyBs()).expect(201);
    expect(created.body.exchangeRate).toBeNull();
    const stored = await harness.pool.query('SELECT exchange_rate FROM groups WHERE id = $1', [
      created.body.id,
    ]);
    expect(stored.rows[0].exchange_rate).toBeNull();
  });

  it('RF-001-01: exactamente uno de catalogPlanSlug o customServiceName', async () => {
    const owner = await harness.insertUser();
    await post(owner, '/groups', bodyBs({ customServiceName: undefined })).expect(400);
    await post(owner, '/groups', bodyBs({ catalogPlanSlug: 'netflix-premium' })).expect(400);
  });

  it('RF-001-01: un plan inexistente o inactivo responde 404', async () => {
    const owner = await harness.insertUser();
    const base = bodyBs({ customServiceName: undefined });
    await post(owner, '/groups', { ...base, catalogPlanSlug: 'no-existe' }).expect(404);
    await post(owner, '/groups', { ...base, catalogPlanSlug: 'plan-inactivo' }).expect(404);
  });

  it('RN-001-13: cupos mayores a los del plan responden 422 con la regla', async () => {
    const owner = await harness.insertUser();
    const response = await post(
      owner,
      '/groups',
      bodyBs({ customServiceName: undefined, catalogPlanSlug: 'plan-corto', totalSlots: 3 }),
    ).expect(422);
    expect(response.body).toMatchObject({ code: 'BUSINESS_RULE', details: { rule: 'RN-001-13' } });
  });

  it('RN-001-09: precio o cupos fuera de rango responden 422 y no crean nada', async () => {
    const owner = await harness.insertUser();
    const before = await countGroups();
    for (const overrides of [
      { priceCents: 99 },
      { priceCents: 500001 },
      { totalSlots: 1 },
      { totalSlots: 21 },
    ]) {
      const response = await post(owner, '/groups', bodyBs(overrides)).expect(422);
      expect(response.body).toMatchObject({
        code: 'BUSINESS_RULE',
        details: { rule: 'RN-001-09' },
      });
    }
    expect(await countGroups()).toBe(before);
  });

  it('RF-001-02: el día de cobro fuera de 1 a 31 es VALIDATION_ERROR', async () => {
    const owner = await harness.insertUser();
    await post(owner, '/groups', bodyBs({ billingDay: 0 })).expect(400);
    await post(owner, '/groups', bodyBs({ billingDay: 32 })).expect(400);
  });

  it('CA-001-24: quien no está habilitado recibe NOT_HOST_ELIGIBLE con los datos de elegibilidad', async () => {
    const user = await harness.insertUser();
    eligibility.ineligible.add(user);
    const before = await countGroups();

    const response = await post(user, '/groups', bodyBs()).expect(422);

    expect(response.body).toMatchObject({
      code: 'NOT_HOST_ELIGIBLE',
      details: {
        rule: 'RF-001-21',
        eligible: false,
        requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
        current: { stars: 4, consideredCharges: 3 },
      },
    });
    expect(await countGroups()).toBe(before);
  });

  it('CA-001-25: quien está habilitado crea el grupo', async () => {
    const user = await harness.insertUser();
    const response = await post(user, '/groups', bodyBs()).expect(201);
    expect(response.body.myRole).toBe('titular');
  });

  it('CA-001-28: el quinto grupo se crea, el sexto es TOO_MANY_ACTIVE_GROUPS y como miembro no hay límite', async () => {
    const user = await harness.insertUser();
    for (let i = 0; i < 5; i++) await post(user, '/groups', bodyBs()).expect(201);

    const sixth = await post(user, '/groups', bodyBs()).expect(422);
    expect(sixth.body).toMatchObject({
      code: 'TOO_MANY_ACTIVE_GROUPS',
      details: { rule: 'RN-001-14' },
    });

    // Como miembro de varios grupos ajenos sigue sin límite.
    for (let i = 0; i < 6; i++) {
      const owner = await harness.insertUser();
      const created = await post(owner, '/groups', bodyBs()).expect(201);
      await harness.pool.query(`UPDATE groups SET total_slots = 5 WHERE id = $1`, [
        created.body.id,
      ]);
      await harness.pool.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'miembro', 'creacion')`,
        [created.body.id, user],
      );
    }
    const count = await harness.pool.query(
      'SELECT count(*) AS n FROM group_members WHERE user_id = $1 AND role = $2',
      [user, 'miembro'],
    );
    expect(Number(count.rows[0].n)).toBe(6);
  });

  it('CA-001-28: cerrar un grupo libera un lugar', async () => {
    const user = await harness.insertUser();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await post(user, '/groups', bodyBs()).expect(201)).body.id as string);
    }
    await post(user, '/groups', bodyBs()).expect(422);
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`,
      [ids[0]],
    );
    await post(user, '/groups', bodyBs()).expect(201);
  });

  it('CA-001-28: seis altas simultáneas del mismo titular crean exactamente cinco', async () => {
    const user = await harness.insertUser();

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => post(user, '/groups', bodyBs())),
    );

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 422]);
    expect(responses.find((r) => r.status === 422)?.body.code).toBe('TOO_MANY_ACTIVE_GROUPS');
    const stored = await harness.pool.query(
      `SELECT count(*) AS n FROM groups WHERE owner_id = $1`,
      [user],
    );
    expect(Number(stored.rows[0].n)).toBe(5);
  });

  describe('POST /groups/quote', () => {
    it('RF-001-04: calcula el total en Bs y las cuotas, el resto al titular', async () => {
      const user = await harness.insertUser();
      const response = await post(user, '/groups/quote', {
        priceCents: 1000,
        currency: 'USD',
        exchangeRate: '6.96',
        memberCount: 3,
      }).expect(200);
      expect(response.body).toEqual({
        totalBsCents: 6960,
        baseShareCents: 2320,
        ownerShareCents: 2320,
        remainderCents: 0,
      });

      const uneven = await post(user, '/groups/quote', {
        priceCents: 10001,
        currency: 'BS',
        memberCount: 3,
      }).expect(200);
      expect(uneven.body).toEqual({
        totalBsCents: 10001,
        baseShareCents: 3333,
        ownerShareCents: 3335,
        remainderCents: 2,
      });
    });

    it('RF-001-04: datos inválidos responden VALIDATION_ERROR', async () => {
      const user = await harness.insertUser();
      const usdNoRate = await post(user, '/groups/quote', {
        priceCents: 1000,
        currency: 'USD',
        memberCount: 3,
      }).expect(400);
      expect(usdNoRate.body.code).toBe('VALIDATION_ERROR');
      await post(user, '/groups/quote', {
        priceCents: 1000,
        currency: 'BS',
        memberCount: 0,
      }).expect(400);
      await post(user, '/groups/quote', { priceCents: 10, currency: 'BS', memberCount: 2 }).expect(
        400,
      );
    });

    it('RF-001-04: no crea nada', async () => {
      const user = await harness.insertUser();
      const before = await countGroups();
      await post(user, '/groups/quote', {
        priceCents: 1000,
        currency: 'BS',
        memberCount: 2,
      }).expect(200);
      expect(await countGroups()).toBe(before);
    });
  });

  describe('GET /users/me/host-eligibility', () => {
    it('RF-001-21: devuelve elegibilidad, requisito, calificación actual y grupos activos', async () => {
      const user = await harness.insertUser();
      eligibility.ineligible.add(user);

      const response = await http()
        .get('/users/me/host-eligibility')
        .set('Authorization', `Bearer ${harness.token(user)}`)
        .expect(200);

      expect(response.body).toEqual({
        eligible: false,
        source: null,
        activeGroups: 0,
        maxActiveGroups: 5,
        canCreateMore: true,
        requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
        current: { stars: 4, consideredCharges: 3, level: null },
      });
    });
  });
});
