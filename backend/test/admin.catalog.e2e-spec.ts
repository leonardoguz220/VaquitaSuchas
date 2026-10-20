import { randomUUID } from 'node:crypto';
import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { createAdmin, randomPassword, type AdminActor } from './support/admin-fixtures.js';

// Spec 009, US5: altas, ediciones y (des)activación del catálogo (RF-009-04, 05, 07). Requiere PostgreSQL.
describe('Catálogo en administración (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;

  const send = (method: 'post' | 'patch', url: string, body: object = {}) =>
    t.http()[method](url).set('Authorization', `Bearer ${admin.token}`).send(body);
  const pub = (url: string) => t.http().get(url).set('Authorization', `Bearer ${admin.token}`);
  const slug = (base: string): string => `${base}-${randomUUID().slice(0, 8)}`;
  const serviceBody = (name = slug('servicio')) => ({
    slug: name,
    name: `Servicio ${name}`,
    category: 'video',
    logoUrl: 'https://cdn.example.test/logo.png',
    brandColor: '#112233',
  });
  const planBody = (serviceId: string, planSlug = slug('plan')) => ({
    serviceId,
    slug: planSlug,
    name: 'Plan familiar',
    priceCents: 1999,
    currency: 'USD',
    maxSlots: 4,
    individualPriceCents: 999,
  });
  const audit = async (targetId: string) =>
    (
      await t.db.query<{ action: string }>(
        'SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY occurred_at, id',
        [targetId],
      )
    ).rows.map((r) => r.action);

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-009-02: crea un servicio y un plan, aparecen en el catálogo y quedan auditados', async () => {
    const created = await send('post', '/admin/catalog/services', serviceBody('nuevo-servicio'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      slug: 'nuevo-servicio',
      isActive: true,
      category: 'video',
    });
    const plan = await send(
      'post',
      '/admin/catalog/plans',
      planBody(created.body.id, 'nuevo-plan'),
    );
    expect(plan.status).toBe(201);
    expect(plan.body).toMatchObject({
      slug: 'nuevo-plan',
      priceCents: 1999,
      currency: 'USD',
      maxSlots: 4,
    });

    const shown = await pub('/catalog/services/nuevo-servicio');
    expect(shown.status).toBe(200);
    expect(JSON.stringify(shown.body)).toContain('nuevo-plan');
    expect(await audit(created.body.id)).toEqual(['catalogo_crear']);
    expect(await audit(plan.body.id)).toEqual(['catalogo_crear']);
  });

  it('CA-009-03: un slug repetido responde 409 y no crea nada', async () => {
    const first = await send('post', '/admin/catalog/services', serviceBody('slug-repetido'));
    expect(first.status).toBe(201);

    const again = await send('post', '/admin/catalog/services', {
      ...serviceBody('slug-repetido'),
      name: 'Otro nombre distinto',
    });

    expect(again.status).toBe(409);
    const count = await t.db.query(`SELECT 1 FROM catalog_services WHERE slug = 'slug-repetido'`);
    expect(count.rows).toHaveLength(1);
  });

  it('valida cupos 2–20, montos positivos y categoría con 400 por campo', async () => {
    const service = await send('post', '/admin/catalog/services', serviceBody());

    const badPlan = await send('post', '/admin/catalog/plans', {
      ...planBody(service.body.id),
      maxSlots: 21,
      priceCents: 0,
    });
    const badService = await send('post', '/admin/catalog/services', {
      ...serviceBody(),
      category: 'inventada',
    });

    expect(badPlan.status).toBe(400);
    expect(Object.keys(badPlan.body.details.fields).sort()).toEqual(['maxSlots', 'priceCents']);
    expect(badService.status).toBe(400);
    expect(badService.body.details.fields.category).toBeDefined();
  });

  it('CA-009-04: cambiar el precio de un plan avisa y no toca las suscripciones existentes', async () => {
    const service = await send('post', '/admin/catalog/services', serviceBody());
    const plan = await send('post', '/admin/catalog/plans', planBody(service.body.id));
    const owner = await t.createUser();
    const client = await t.db.connect();
    let groupId: string;
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO groups (owner_id, name, service_name_snapshot, catalog_plan_id, plan_name_snapshot,
                             plan_max_slots_snapshot, price_cents, currency, exchange_rate, billing_day,
                             total_slots, invite_code)
         VALUES ($1, 'Grupo del plan', 'Servicio', $2, 'Plan familiar', 4, 1999, 'USD', 6.96, 15, 4,
                 'KMNPQRST') RETURNING id`,
        [owner.id, plan.body.id],
      );
      groupId = (inserted.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source) VALUES ($1, $2, 'titular', 'creacion')`,
        [groupId, owner.id],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const before = await t.db.query(`SELECT price_cents FROM groups WHERE id = $1`, [groupId]);

    const edited = await send('patch', `/admin/catalog/plans/${plan.body.id as string}`, {
      priceCents: 2999,
    });

    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      priceCents: 2999,
      warning: 'No cambia las suscripciones existentes',
    });
    const after = await t.db.query(`SELECT price_cents FROM groups WHERE id = $1`, [groupId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const renamed = await send('patch', `/admin/catalog/plans/${plan.body.id as string}`, {
      name: 'Otro nombre',
    });
    expect(renamed.body.warning).toBeUndefined();
    expect(await audit(plan.body.id)).toEqual([
      'catalogo_crear',
      'catalogo_editar',
      'catalogo_editar',
    ]);
  });

  it('CA-009-05: un plan desactivado deja de ofrecerse y se puede reactivar', async () => {
    const service = await send('post', '/admin/catalog/services', serviceBody('servicio-plan-off'));
    const plan = await send('post', '/admin/catalog/plans', planBody(service.body.id, 'plan-off'));

    const off = await send('post', `/admin/catalog/plans/${plan.body.id as string}/deactivate`);
    expect(off.body.isActive).toBe(false);
    const hidden = await pub('/catalog/services/servicio-plan-off');
    expect(JSON.stringify(hidden.body)).not.toContain('plan-off');

    const on = await send('post', `/admin/catalog/plans/${plan.body.id as string}/activate`);
    expect(on.body.isActive).toBe(true);
    expect(JSON.stringify((await pub('/catalog/services/servicio-plan-off')).body)).toContain(
      'plan-off',
    );
    expect(await audit(plan.body.id)).toEqual([
      'catalogo_crear',
      'catalogo_desactivar',
      'catalogo_activar',
    ]);
  });

  it('el slug no se edita y un id inexistente responde 404', async () => {
    const service = await send('post', '/admin/catalog/services', serviceBody('slug-fijo'));

    const edited = await send('patch', `/admin/catalog/services/${service.body.id as string}`, {
      slug: 'otro-slug',
      name: 'Nombre editado',
    });

    expect(edited.body).toMatchObject({ slug: 'slug-fijo', name: 'Nombre editado' });
    expect(
      (await send('patch', `/admin/catalog/services/${randomUUID()}`, { name: 'No existe' }))
        .status,
    ).toBe(404);
    expect((await send('post', `/admin/catalog/plans/${randomUUID()}/deactivate`)).status).toBe(
      404,
    );
  });

  it('RF-009-04: GET /admin/catalog lista servicios con sus planes, también los desactivados', async () => {
    const service = await send('post', '/admin/catalog/services', serviceBody('lista-servicio'));
    const plan = await send('post', '/admin/catalog/plans', planBody(service.body.id as string));
    await send('post', `/admin/catalog/plans/${plan.body.id as string}/deactivate`);

    const res = await pub('/admin/catalog');

    expect(res.status).toBe(200);
    const listed = (res.body as { id: string; plans: object[] }[]).find(
      (s) => s.id === service.body.id,
    );
    expect(listed).toMatchObject({
      slug: 'lista-servicio',
      isActive: true,
      plans: [{ id: plan.body.id, priceCents: 1999, currency: 'USD', isActive: false }],
    });
  });

  it('RF-009-04: GET /admin/catalog responde 403 a un usuario normal y 401 sin sesión', async () => {
    const password = randomPassword();
    const user = await t.createUser({ password });
    const login = await t.login(user.email, password);
    const normal = await t
      .http()
      .get('/admin/catalog')
      .set('Authorization', `Bearer ${login.body.sessionToken as string}`);
    expect(normal.status).toBe(403);
    expect((await t.http().get('/admin/catalog')).status).toBe(401);
  });
});
