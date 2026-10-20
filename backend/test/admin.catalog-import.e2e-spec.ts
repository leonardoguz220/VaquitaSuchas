import { startAuthApp, type AuthTestApp } from './support/auth-app.js';
import { createAdmin, type AdminActor } from './support/admin-fixtures.js';

const HEADER =
  'tipo,servicio,slug,nombre,categoria,logo_url,color,precio,moneda,cupos,precio_individual';

// Spec 009, US5: importación del catálogo en dos pasos (RF-009-06, CA-009-06). Requiere PostgreSQL.
describe('Importación del catálogo (spec 009)', () => {
  let t: AuthTestApp;
  let admin: AdminActor;
  let other: AdminActor;

  const post = (actor: AdminActor, url: string, body: object) =>
    t.http().post(url).set('Authorization', `Bearer ${actor.token}`).send(body);
  const preview = (content: string, format: 'csv' | 'json' = 'csv', actor = admin) =>
    post(actor, '/admin/catalog/import/preview', { format, content });
  const exists = async (table: 'catalog_services' | 'catalog_plans', slug: string) =>
    (await t.db.query(`SELECT 1 FROM ${table} WHERE slug = $1`, [slug])).rows.length > 0;

  beforeAll(async () => {
    t = await startAuthApp();
    admin = await createAdmin(t);
    other = await createAdmin(t);
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('vista previa válida y aplicar crea servicios y planes, con una sola auditoría', async () => {
    const csv = [
      HEADER,
      'servicio,,imp-serv,Servicio importado,musica,https://cdn.example.test/l.png,#abcdef,,,,',
      'plan,imp-serv,imp-plan,Plan importado,,,,19.99,USD,4,9.99',
    ].join('\n');

    const prev = await preview(csv);

    expect(prev.status).toBe(200);
    expect(prev.body.errors).toEqual([]);
    expect(prev.body.changes).toEqual([
      { row: 2, kind: 'servicio', slug: 'imp-serv', action: 'crear' },
      { row: 3, kind: 'plan', slug: 'imp-plan', action: 'crear' },
    ]);
    expect(await exists('catalog_services', 'imp-serv')).toBe(false);

    const applied = await post(admin, '/admin/catalog/import/apply', { token: prev.body.token });
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual({ created: 2, updated: 0 });
    const plan = await t.db.query<{ price_cents: string; max_slots: number }>(
      `SELECT price_cents, max_slots FROM catalog_plans WHERE slug = 'imp-plan'`,
    );
    expect(plan.rows[0]).toMatchObject({ price_cents: '1999', max_slots: 4 });
    const log = await t.db.query(
      `SELECT 1 FROM admin_audit_log WHERE action = 'catalogo_importar'`,
    );
    expect(log.rows).toHaveLength(1);

    const again = await post(admin, '/admin/catalog/import/apply', { token: prev.body.token });
    expect(again.status).toBe(422);
  });

  it('CA-009-06: una fila inválida detiene todo, informa fila y campo, y no escribe nada', async () => {
    const csv = [
      HEADER,
      'servicio,,ok-serv,Servicio válido,video,,,,,,',
      'plan,ok-serv,mal-plan,Plan malo,,,,10,USD,25,',
      'plan,no-existe,otro-plan,Plan huérfano,,,,10,USD,3,',
    ].join('\n');

    const prev = await preview(csv);

    expect(prev.status).toBe(200);
    expect(prev.body.token).toBeNull();
    expect(prev.body.errors).toEqual([
      { row: 3, field: 'maxSlots', message: expect.any(String) },
      { row: 4, field: 'serviceSlug', message: expect.any(String) },
    ]);
    expect(await exists('catalog_services', 'ok-serv')).toBe(false);
  });

  it('acepta JSON y marca «actualizar» lo que ya existe', async () => {
    await post(admin, '/admin/catalog/import/apply', {
      token: (await preview(`${HEADER}\nservicio,,json-serv,Servicio uno,video,,,,,,`)).body.token,
    });

    const prev = await preview(
      JSON.stringify({
        services: [{ slug: 'json-serv', name: 'Servicio uno editado', category: 'video' }],
        plans: [
          {
            serviceSlug: 'json-serv',
            slug: 'json-plan',
            name: 'Plan',
            priceCents: 500,
            currency: 'BS',
            maxSlots: 2,
          },
        ],
      }),
      'json',
    );

    expect(prev.body.errors).toEqual([]);
    expect(prev.body.changes.map((c: { action: string }) => c.action)).toEqual([
      'actualizar',
      'crear',
    ]);
  });

  it('el token es de quien hizo la vista previa y un JSON roto responde 400', async () => {
    const prev = await preview(`${HEADER}\nservicio,,solo-mio,Servicio mío,video,,,,,,`);

    expect(
      (await post(other, '/admin/catalog/import/apply', { token: prev.body.token })).status,
    ).toBe(422);
    expect(await exists('catalog_services', 'solo-mio')).toBe(false);
    expect((await preview('{ no es json', 'json')).status).toBe(400);
  });
});
