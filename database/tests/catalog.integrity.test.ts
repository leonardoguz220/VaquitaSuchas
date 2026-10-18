// Spec 004 (data-model.md §1, §2 y §3): integridad del catálogo de servicios.
// - 0020_catalog.sql crea catalog_services y catalog_plans; cada restricción se prueba
//   intentando violarla (RN-004-02, RN-004-03, RN-004-04, RF-004-06).
// - database/src/seed-catalog.ts valida todo el archivo antes de escribir y lo aplica en una
//   transacción, de forma idempotente por slug (CA-004-05, CA-004-06, RN-004-06, RNF-004-03).
// Los datos son ficticios y de prueba: slugs test-*, precios inventados y URLs de example.com.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import {
  applyCatalog,
  CatalogValidationError,
  validateCatalog,
  type CatalogData,
  type CatalogPlanInput,
} from '../src/seed-catalog.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

interface PgError {
  code?: string;
  constraint?: string;
}

async function rejectsWith(
  sql: string,
  params: unknown[],
  expected: { code: string; constraint?: string },
): Promise<void> {
  await assert.rejects(queryRows(db.connectionString, sql, params), (error: PgError) => {
    assert.equal(error.code, expected.code, `código inesperado para ${JSON.stringify(params)}`);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    return true;
  });
}

// Cada prueba usa slugs y nombres propios para no chocar con las demás en la misma base.
let counter = 0;
function unique(prefix: string): { slug: string; name: string } {
  counter += 1;
  return { slug: `${prefix}-${counter}`, name: `Servicio de prueba ${counter}` };
}

const INSERT_SERVICE =
  'INSERT INTO catalog_services (slug, name, category, logo_url, brand_color) VALUES ($1, $2, $3, $4, $5) RETURNING id';

async function insertService(
  overrides: Partial<{
    slug: string;
    name: string;
    category: string;
    brandColor: string | null;
  }> = {},
): Promise<string> {
  const base = unique('svc');
  const [row] = await queryRows<{ id: string }>(db.connectionString, INSERT_SERVICE, [
    overrides.slug ?? base.slug,
    overrides.name ?? base.name,
    overrides.category ?? 'video',
    null,
    overrides.brandColor ?? null,
  ]);
  assert.ok(row);
  return row.id;
}

const INSERT_PLAN = `INSERT INTO catalog_plans
  (service_id, slug, name, price_cents, currency, max_slots, individual_price_cents)
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;

interface PlanValues {
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  maxSlots: number;
  individualPriceCents: number | null;
}

function planParams(serviceId: string, overrides: Partial<PlanValues> = {}): unknown[] {
  const base = unique('plan');
  return [
    serviceId,
    overrides.slug ?? base.slug,
    overrides.name ?? 'Plan de prueba',
    overrides.priceCents ?? 1000,
    overrides.currency ?? 'USD',
    overrides.maxSlots ?? 4,
    overrides.individualPriceCents === undefined ? null : overrides.individualPriceCents,
  ];
}

const insertPlan = (serviceId: string, overrides: Partial<PlanValues> = {}): Promise<unknown[]> =>
  queryRows(db.connectionString, INSERT_PLAN, planParams(serviceId, overrides));

// --- Restricciones de catalog_services y catalog_plans (0020_catalog.sql) ----------------------

test('RF-004-01: un servicio y un plan válidos se insertan con los valores por defecto', async () => {
  const serviceId = await insertService({ brandColor: '#E50914' });
  assert.match(serviceId, UUID);
  const [service] = await queryRows<{ is_active: boolean; created_at: Date; updated_at: Date }>(
    db.connectionString,
    'SELECT is_active, created_at, updated_at FROM catalog_services WHERE id = $1',
    [serviceId],
  );
  assert.equal(service?.is_active, true);
  assert.ok(service?.created_at instanceof Date);
  assert.ok(service?.updated_at instanceof Date);

  const [plan] = await queryRows<{
    id: string;
    is_active: boolean;
    sort_order: number;
    verified_on: Date | null;
    verified_source: string | null;
    individual_price_cents: string | null;
  }>(
    db.connectionString,
    `${INSERT_PLAN.replace('RETURNING id', '')} RETURNING id, is_active, sort_order, verified_on, verified_source, individual_price_cents`,
    planParams(serviceId),
  );
  assert.ok(plan);
  assert.match(plan.id, UUID);
  assert.equal(plan.is_active, true);
  assert.equal(plan.sort_order, 0);
  assert.equal(plan.verified_on, null);
  assert.equal(plan.verified_source, null);
  assert.equal(plan.individual_price_cents, null);
});

test('RN-004-04: un slug de servicio con mayúsculas, espacios, guiones al borde o doble guion falla', async () => {
  for (const slug of ['Netflix', 'net flix', ' netflix', '-netflix', 'netflix-', 'net--flix', '']) {
    const { name } = unique('svc');
    await rejectsWith(INSERT_SERVICE, [slug, name, 'video', null, null], { code: '23514' });
  }
});

test('RN-004-04: slugs de servicio con minúsculas, dígitos y guiones simples pasan', async () => {
  for (const slug of ['x-netflix', 'x-youtube-premium', 'x-max2', 'x-9']) {
    await insertService({ slug });
  }
});

test('RN-004-04: un slug de servicio repetido falla con catalog_services_slug_key', async () => {
  const { slug } = unique('svc');
  await insertService({ slug });
  await rejectsWith(INSERT_SERVICE, [slug, unique('svc').name, 'video', null, null], {
    code: '23505',
    constraint: 'catalog_services_slug_key',
  });
});

test('RN-004-04: un slug de plan con mayúsculas, espacios, guiones al borde o doble guion falla', async () => {
  const serviceId = await insertService();
  for (const slug of [
    'Netflix-Premium',
    'netflix premium',
    '-premium',
    'premium-',
    'net--premium',
  ]) {
    await assert.rejects(insertPlan(serviceId, { slug }), (error: PgError) => {
      assert.equal(error.code, '23514', `slug ${JSON.stringify(slug)}`);
      return true;
    });
  }
});

test('RN-004-04: un slug de plan repetido falla con catalog_plans_slug_key, aun en otro servicio', async () => {
  const first = await insertService();
  const second = await insertService();
  const { slug } = unique('plan');
  await insertPlan(first, { slug });
  await assert.rejects(insertPlan(second, { slug }), (error: PgError) => {
    assert.equal(error.code, '23505');
    assert.equal(error.constraint, 'catalog_plans_slug_key');
    return true;
  });
});

test('caso borde "nombre duplicado": Música y musica fallan con catalog_services_name_uq', async () => {
  await insertService({ name: 'Música' });
  for (const name of ['musica', 'MUSICA', ' Musica ']) {
    await rejectsWith(INSERT_SERVICE, [unique('svc').slug, name, 'musica', null, null], {
      code: '23505',
      constraint: 'catalog_services_name_uq',
    });
  }
});

test('caso borde "nombre duplicado": Música+ y MUSICA+ fallan con catalog_services_name_uq', async () => {
  await insertService({ name: 'Música+' });
  await rejectsWith(INSERT_SERVICE, [unique('svc').slug, 'MUSICA+', 'musica', null, null], {
    code: '23505',
    constraint: 'catalog_services_name_uq',
  });
});

test('data-model §1: el nombre de un servicio tiene de 2 a 60 caracteres sin contar espacios al borde', async () => {
  for (const name of ['A', '   A   ', 'x'.repeat(61), '']) {
    await rejectsWith(INSERT_SERVICE, [unique('svc').slug, name, 'video', null, null], {
      code: '23514',
    });
  }
  await insertService({ name: 'Zq' });
  await insertService({ name: 'y'.repeat(60) });
});

test('data-model §1: el nombre de un plan tiene de 2 a 60 caracteres', async () => {
  const serviceId = await insertService();
  for (const name of ['B', '  B  ', 'p'.repeat(61)]) {
    await assert.rejects(insertPlan(serviceId, { name }), (error: PgError) => {
      assert.equal(error.code, '23514', `nombre de ${name.length} caracteres`);
      return true;
    });
  }
  await insertPlan(serviceId, { name: 'Pz' });
  await insertPlan(serviceId, { name: 'q'.repeat(60) });
});

test('RF-004-03: una categoría fuera de la lista cerrada falla', async () => {
  for (const category of ['peliculas', 'Video', 'música', 'other', '']) {
    await rejectsWith(
      INSERT_SERVICE,
      [unique('svc').slug, unique('svc').name, category, null, null],
      {
        code: '23514',
      },
    );
  }
});

test('RF-004-03: las seis categorías de la spec pasan', async () => {
  for (const category of ['video', 'musica', 'juegos', 'educacion', 'almacenamiento', 'otras']) {
    await insertService({ category });
  }
});

test('data-model §1: brand_color inválido falla; #RRGGBB y NULL pasan', async () => {
  for (const color of ['red', '#12345', '#1234567', 'E50914', '#GGGGGG']) {
    await rejectsWith(
      INSERT_SERVICE,
      [unique('svc').slug, unique('svc').name, 'video', null, color],
      {
        code: '23514',
      },
    );
  }
  await insertService({ brandColor: '#E50914' });
  await insertService({ brandColor: '#1db954' });
  await insertService({ brandColor: null });
});

test('RN-004-03: max_slots 1 y 21 fallan; 2 y 20 pasan', async () => {
  const serviceId = await insertService();
  for (const maxSlots of [1, 21, 0]) {
    await assert.rejects(insertPlan(serviceId, { maxSlots }), (error: PgError) => {
      assert.equal(error.code, '23514', `max_slots ${maxSlots}`);
      return true;
    });
  }
  await insertPlan(serviceId, { maxSlots: 2 });
  await insertPlan(serviceId, { maxSlots: 20 });
});

test('RN-004-02: price_cents 0 o negativo falla', async () => {
  const serviceId = await insertService();
  for (const priceCents of [0, -1, -2299]) {
    await assert.rejects(insertPlan(serviceId, { priceCents }), (error: PgError) => {
      assert.equal(error.code, '23514', `price_cents ${priceCents}`);
      return true;
    });
  }
  await insertPlan(serviceId, { priceCents: 1 });
});

test('RN-004-02: price_cents es bigint (centavos enteros)', async () => {
  const [col] = await queryRows<{ data_type: string }>(
    db.connectionString,
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'catalog_plans' AND column_name = 'price_cents'`,
  );
  assert.equal(col?.data_type, 'bigint');
});

test('RN-004-02: individual_price_cents 0 o negativo falla; NULL y positivo pasan', async () => {
  const serviceId = await insertService();
  for (const individualPriceCents of [0, -5]) {
    await assert.rejects(insertPlan(serviceId, { individualPriceCents }), (error: PgError) => {
      assert.equal(error.code, '23514', `individual_price_cents ${individualPriceCents}`);
      return true;
    });
  }
  await insertPlan(serviceId, { individualPriceCents: null });
  await insertPlan(serviceId, { individualPriceCents: 999 });
});

test('RN-004-02: currency distinta de USD o BS falla', async () => {
  const serviceId = await insertService();
  for (const currency of ['EUR', 'usd', 'Bs', 'BOB', '']) {
    await assert.rejects(insertPlan(serviceId, { currency }), (error: PgError) => {
      assert.equal(error.code, '23514', `currency ${JSON.stringify(currency)}`);
      return true;
    });
  }
  await insertPlan(serviceId, { currency: 'USD' });
  await insertPlan(serviceId, { currency: 'BS' });
});

test('RF-004-06: un plan con un service_id inexistente falla (clave foránea)', async () => {
  await assert.rejects(insertPlan('00000000-0000-4000-8000-000000000000'), (error: PgError) => {
    assert.equal(error.code, '23503');
    return true;
  });
});

test('RF-004-06: borrar un servicio con planes falla (ON DELETE RESTRICT)', async () => {
  const serviceId = await insertService();
  await insertPlan(serviceId);
  await rejectsWith('DELETE FROM catalog_services WHERE id = $1', [serviceId], { code: '23503' });

  const [fk] = await queryRows<{ confdeltype: string }>(
    db.connectionString,
    `SELECT confdeltype FROM pg_constraint
     WHERE conrelid = 'catalog_plans'::regclass AND contype = 'f'
       AND confrelid = 'catalog_services'::regclass`,
  );
  assert.equal(fk?.confdeltype, 'r', 'la FK de catalog_plans debe ser ON DELETE RESTRICT');
});

test('RF-000-07: un UPDATE actualiza updated_at en catalog_services y catalog_plans', async () => {
  // Las filas nacen con fechas viejas; el disparador set_updated_at debe moverlas al actualizar.
  const old = '2020-01-01T00:00:00Z';
  const { slug, name } = unique('svc');
  const [service] = await queryRows<{ id: string }>(
    db.connectionString,
    `INSERT INTO catalog_services (slug, name, category, created_at, updated_at)
     VALUES ($1, $2, 'video', $3, $3) RETURNING id`,
    [slug, name, old],
  );
  assert.ok(service);
  const [plan] = await queryRows<{ id: string }>(
    db.connectionString,
    `INSERT INTO catalog_plans
       (service_id, slug, name, price_cents, currency, max_slots, created_at, updated_at)
     VALUES ($1, $2, 'Plan de prueba', 1000, 'USD', 4, $3, $3) RETURNING id`,
    [service.id, unique('plan').slug, old],
  );
  assert.ok(plan);
  for (const [table, id] of [
    ['catalog_services', service.id],
    ['catalog_plans', plan.id],
  ] as const) {
    const [row] = await queryRows<{ updated_at: Date; created_at: Date }>(
      db.connectionString,
      `UPDATE ${table} SET is_active = false WHERE id = $1 RETURNING updated_at, created_at`,
      [id],
    );
    assert.ok(row && row.updated_at.getTime() > new Date(old).getTime(), `${table}.updated_at`);
    assert.equal(row.created_at.toISOString(), '2020-01-01T00:00:00.000Z');
  }
});

// --- validateCatalog y applyCatalog (database/src/seed-catalog.ts) -----------------------------

// Catálogo ficticio de prueba: no son precios reales.
function testCatalog(): CatalogData {
  return {
    services: [
      {
        slug: 'test-video',
        name: 'Test Video',
        category: 'video',
        logoUrl: 'https://example.com/test-video.png',
        brandColor: '#112233',
        plans: [
          {
            slug: 'test-video-basico',
            name: 'Básico de prueba',
            priceCents: 1111,
            currency: 'USD',
            maxSlots: 2,
            individualPriceCents: 1111,
            verifiedOn: '2026-10-18',
            verifiedSource: 'https://example.com/test-video/precios',
            sortOrder: 1,
          },
          {
            slug: 'test-video-familiar',
            name: 'Familiar de prueba',
            priceCents: 2222,
            currency: 'USD',
            maxSlots: 4,
            individualPriceCents: null,
            verifiedOn: '2026-10-18',
            verifiedSource: 'https://example.com/test-video/precios',
            sortOrder: 2,
          },
        ],
      },
      {
        slug: 'test-musica',
        name: 'Test Música',
        category: 'musica',
        logoUrl: null,
        brandColor: null,
        plans: [
          {
            slug: 'test-musica-duo',
            name: 'Dúo de prueba',
            priceCents: 3333,
            currency: 'BS',
            maxSlots: 2,
            verifiedOn: '2026-10-18',
            verifiedSource: 'Referencia de prueba',
          },
        ],
      },
    ],
  };
}

const TEST_SERVICE_COUNT = 2;
const TEST_PLAN_COUNT = 3;

function firstPlan(data: CatalogData, serviceIndex = 0, planIndex = 0): CatalogPlanInput {
  const plan = data.services[serviceIndex]?.plans[planIndex];
  assert.ok(plan);
  return plan;
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const apply = (data: unknown): Promise<{ services: number; plans: number }> =>
  withClient((client) => applyCatalog(client, data));

async function counts(): Promise<{ services: number; plans: number }> {
  const [row] = await queryRows<{ services: number; plans: number }>(
    db.connectionString,
    `SELECT (SELECT count(*)::int FROM catalog_services) AS services,
            (SELECT count(*)::int FROM catalog_plans) AS plans`,
  );
  assert.ok(row);
  return row;
}

// Foto completa (todas las columnas, incluidos id y fechas) de las filas del catálogo de prueba.
async function snapshot(): Promise<unknown[]> {
  return queryRows(
    db.connectionString,
    `SELECT 'service' AS kind, to_jsonb(s) AS row FROM catalog_services s WHERE s.slug LIKE 'test-%'
     UNION ALL
     SELECT 'plan', to_jsonb(p) FROM catalog_plans p WHERE p.slug LIKE 'test-%'
     ORDER BY 1, 2`,
  );
}

function assertValidationError(fn: () => unknown, ...fragments: string[]): CatalogValidationError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CatalogValidationError, 'se esperaba CatalogValidationError');
  assert.ok(caught instanceof Error);
  assert.ok(Array.isArray(caught.problems) && caught.problems.length > 0, 'problems vacío');
  for (const fragment of fragments) {
    assert.ok(
      caught.problems.some((p) => p.includes(fragment)),
      `se esperaba un problema con "${fragment}" en: ${JSON.stringify(caught.problems)}`,
    );
  }
  return caught;
}

async function assertApplyRejectsValidation(data: unknown, ...fragments: string[]): Promise<void> {
  const before = await counts();
  await assert.rejects(apply(data), (error: unknown) => {
    assert.ok(
      error instanceof CatalogValidationError,
      `se esperaba CatalogValidationError: ${error}`,
    );
    for (const fragment of fragments) {
      assert.ok(
        error.problems.some((p) => p.includes(fragment)),
        `se esperaba un problema con "${fragment}" en: ${JSON.stringify(error.problems)}`,
      );
    }
    return true;
  });
  assert.deepEqual(await counts(), before, 'una validación fallida no debe escribir nada');
}

test('RF-004-07: validateCatalog acepta el catálogo de prueba y lo devuelve', () => {
  const data = validateCatalog(testCatalog());
  assert.equal(data.services.length, TEST_SERVICE_COUNT);
  assert.deepEqual(
    data.services.map((s) => s.slug),
    ['test-video', 'test-musica'],
  );
});

test('RF-004-07: validateCatalog rechaza algo que no es un catálogo', () => {
  for (const value of [null, undefined, 42, 'catalog', [], {}, { services: 'x' }]) {
    assertValidationError(() => validateCatalog(value));
  }
});

test('RN-004-06: un plan sin verifiedOn es rechazado y el problema menciona verifiedOn', () => {
  const data = testCatalog();
  const plan = firstPlan(data, 0, 1) as Partial<CatalogPlanInput>;
  delete plan.verifiedOn;
  assertValidationError(() => validateCatalog(data), 'verifiedOn');
});

test('RN-004-06: un plan con verifiedOn que no es una fecha AAAA-MM-DD es rechazado', () => {
  for (const verifiedOn of ['', '18/10/2026', '2026-13-01', 'ayer']) {
    const data = testCatalog();
    firstPlan(data).verifiedOn = verifiedOn;
    assertValidationError(() => validateCatalog(data), 'verifiedOn');
  }
});

test('RN-004-06: un plan sin verifiedSource es rechazado y el problema menciona verifiedSource', () => {
  const data = testCatalog();
  const plan = firstPlan(data) as Partial<CatalogPlanInput>;
  delete plan.verifiedSource;
  assertValidationError(() => validateCatalog(data), 'verifiedSource');
});

test('RF-004-01: un logoUrl con http:// es rechazado y el problema menciona logoUrl', () => {
  const data = testCatalog();
  const service = data.services[0];
  assert.ok(service);
  service.logoUrl = 'http://example.com/test-video.png';
  assertValidationError(() => validateCatalog(data), 'logoUrl');
});

test('RN-004-04: slugs de plan duplicados en el archivo son rechazados', () => {
  const data = testCatalog();
  firstPlan(data, 1, 0).slug = 'test-video-basico';
  assertValidationError(() => validateCatalog(data), 'test-video-basico');
});

test('RN-004-04: slugs de servicio duplicados en el archivo son rechazados', () => {
  const data = testCatalog();
  const second = data.services[1];
  assert.ok(second);
  second.slug = 'test-video';
  assertValidationError(() => validateCatalog(data), 'test-video');
});

test('caso borde "nombre duplicado": dos servicios con el mismo nombre ignorando tildes y mayúsculas son rechazados', () => {
  const data = testCatalog();
  const second = data.services[1];
  assert.ok(second);
  second.name = 'TEST VÍDEO';
  assertValidationError(() => validateCatalog(data));
});

test('RN-004-02, RN-004-03, RN-004-04: el archivo se valida con las mismas reglas que la base', () => {
  const mutations: [string, (data: CatalogData) => void][] = [
    ['slug de servicio en mayúsculas', (d) => void (d.services[0]!.slug = 'Test-Video')],
    ['slug de servicio con espacios', (d) => void (d.services[0]!.slug = 'test video')],
    ['slug de plan con guion al borde', (d) => void (firstPlan(d).slug = 'test-video-')],
    ['nombre de 1 carácter', (d) => void (d.services[0]!.name = 'T')],
    ['nombre de 61 caracteres', (d) => void (d.services[0]!.name = 'T'.repeat(61))],
    ['categoría fuera de la lista', (d) => void (d.services[0]!.category = 'peliculas')],
    ['brandColor inválido', (d) => void (d.services[0]!.brandColor = 'red')],
    ['maxSlots 1', (d) => void (firstPlan(d).maxSlots = 1)],
    ['maxSlots 21', (d) => void (firstPlan(d).maxSlots = 21)],
    ['maxSlots no entero', (d) => void (firstPlan(d).maxSlots = 2.5)],
    ['priceCents 0', (d) => void (firstPlan(d).priceCents = 0)],
    ['priceCents negativo', (d) => void (firstPlan(d).priceCents = -100)],
    ['priceCents no entero', (d) => void (firstPlan(d).priceCents = 11.5)],
    ['individualPriceCents 0', (d) => void (firstPlan(d).individualPriceCents = 0)],
    ['moneda EUR', (d) => void ((firstPlan(d) as { currency: string }).currency = 'EUR')],
    ['servicio sin planes', (d) => void (d.services[0]!.plans = [])],
  ];
  for (const [label, mutate] of mutations) {
    const data = testCatalog();
    mutate(data);
    assert.throws(
      () => validateCatalog(data),
      (error: unknown) => error instanceof CatalogValidationError,
      `debió rechazarse: ${label}`,
    );
  }
});

test('RF-004-07: validateCatalog informa todos los problemas, no solo el primero', () => {
  const data = testCatalog();
  firstPlan(data, 0, 0).maxSlots = 21;
  firstPlan(data, 1, 0).priceCents = 0;
  const error = assertValidationError(() => validateCatalog(data));
  assert.ok(
    error.problems.length >= 2,
    `se esperaban 2 problemas: ${JSON.stringify(error.problems)}`,
  );
});

test('CA-004-06, RNF-004-03: applyCatalog con un plan inválido en el medio no aplica nada', async () => {
  const data = testCatalog();
  firstPlan(data, 0, 1).maxSlots = 21;
  await assertApplyRejectsValidation(data);
  const rows = await queryRows(
    db.connectionString,
    "SELECT slug FROM catalog_services WHERE slug LIKE 'test-%' UNION ALL SELECT slug FROM catalog_plans WHERE slug LIKE 'test-%'",
  );
  assert.deepEqual(rows, [], 'no debe quedar ninguna fila del lote');
});

test('RN-004-06: applyCatalog rechaza un plan sin verifiedOn sin escribir nada', async () => {
  const data = testCatalog();
  delete (firstPlan(data, 1, 0) as Partial<CatalogPlanInput>).verifiedOn;
  await assertApplyRejectsValidation(data, 'verifiedOn');
});

test('CA-004-05: applyCatalog aplicado dos veces no duplica ni cambia nada', async () => {
  const before = await counts();
  const first = await apply(testCatalog());
  assert.deepEqual(first, { services: TEST_SERVICE_COUNT, plans: TEST_PLAN_COUNT });
  const afterFirst = await counts();
  assert.deepEqual(afterFirst, {
    services: before.services + TEST_SERVICE_COUNT,
    plans: before.plans + TEST_PLAN_COUNT,
  });
  const snapFirst = await snapshot();

  const second = await apply(testCatalog());
  assert.deepEqual(second, first);
  assert.deepEqual(await counts(), afterFirst, 'la segunda aplicación no agrega filas');
  assert.deepEqual(await snapshot(), snapFirst, 'ni cambia valores, ids ni updated_at');
});

test('RF-004-07: applyCatalog guarda los valores del archivo en las columnas del modelo', async () => {
  await apply(testCatalog());
  const [service] = await queryRows<{
    name: string;
    category: string;
    logo_url: string | null;
    brand_color: string | null;
    is_active: boolean;
  }>(
    db.connectionString,
    "SELECT name, category, logo_url, brand_color, is_active FROM catalog_services WHERE slug = 'test-video'",
  );
  assert.deepEqual(service, {
    name: 'Test Video',
    category: 'video',
    logo_url: 'https://example.com/test-video.png',
    brand_color: '#112233',
    is_active: true,
  });
  const [plan] = await queryRows<Record<string, unknown>>(
    db.connectionString,
    `SELECT s.slug AS service_slug, p.name, p.price_cents::int AS price_cents, p.currency,
            p.max_slots, p.individual_price_cents::int AS individual_price_cents,
            to_char(p.verified_on, 'YYYY-MM-DD') AS verified_on, p.verified_source, p.sort_order
     FROM catalog_plans p JOIN catalog_services s ON s.id = p.service_id
     WHERE p.slug = 'test-video-basico'`,
  );
  assert.deepEqual(plan, {
    service_slug: 'test-video',
    name: 'Básico de prueba',
    price_cents: 1111,
    currency: 'USD',
    max_slots: 2,
    individual_price_cents: 1111,
    verified_on: '2026-10-18',
    verified_source: 'https://example.com/test-video/precios',
    sort_order: 1,
  });
});

test('RF-004-07: reaplicar con un precio cambiado actualiza la misma fila (upsert por slug)', async () => {
  await apply(testCatalog());
  const [beforeRow] = await queryRows<{ id: string }>(
    db.connectionString,
    "SELECT id FROM catalog_plans WHERE slug = 'test-video-familiar'",
  );
  const data = testCatalog();
  firstPlan(data, 0, 1).priceCents = 2444;
  await apply(data);
  const [afterRow] = await queryRows<{ id: string; price_cents: string }>(
    db.connectionString,
    "SELECT id, price_cents FROM catalog_plans WHERE slug = 'test-video-familiar'",
  );
  assert.equal(afterRow?.id, beforeRow?.id);
  assert.equal(Number(afterRow?.price_cents), 2444);
  await apply(testCatalog());
});

test('data-model §2: un plan que ya no figura en el archivo no se borra', async () => {
  await apply(testCatalog());
  const before = await counts();
  const data = testCatalog();
  data.services[0]!.plans = data.services[0]!.plans.slice(0, 1);
  await apply(data);
  assert.deepEqual(await counts(), before);
  const [plan] = await queryRows<{ is_active: boolean }>(
    db.connectionString,
    "SELECT is_active FROM catalog_plans WHERE slug = 'test-video-familiar'",
  );
  assert.equal(plan?.is_active, true, 'el plan omitido queda como estaba');
});

test('RNF-004-03: un error de la base a mitad de la escritura revierte todo el lote', async () => {
  // Un servicio insertado a mano ocupa el nombre que el lote intenta usar con otro slug.
  await queryRows(
    db.connectionString,
    "INSERT INTO catalog_services (slug, name, category) VALUES ('sql-choque', 'Servicio Choque', 'otras')",
  );
  const before = await counts();
  const batch: CatalogData = {
    services: [
      {
        slug: 'test-nuevo-a',
        name: 'Test Nuevo A',
        category: 'juegos',
        plans: [
          {
            slug: 'test-nuevo-a-plan',
            name: 'Plan A de prueba',
            priceCents: 500,
            currency: 'BS',
            maxSlots: 3,
            verifiedOn: '2026-10-18',
            verifiedSource: 'Referencia de prueba',
          },
        ],
      },
      {
        slug: 'test-choque',
        name: 'Servicio Choqué',
        category: 'otras',
        plans: [
          {
            slug: 'test-choque-plan',
            name: 'Plan choque de prueba',
            priceCents: 600,
            currency: 'BS',
            maxSlots: 3,
            verifiedOn: '2026-10-18',
            verifiedSource: 'Referencia de prueba',
          },
        ],
      },
    ],
  };

  await withClient(async (client) => {
    await assert.rejects(applyCatalog(client, batch), (error: PgError) => {
      assert.equal(error.code, '23505');
      return true;
    });
    // La conexión queda usable: applyCatalog hizo ROLLBACK y no dejó la transacción abortada.
    const { rows } = await client.query<{ ok: number }>('SELECT 1 AS ok');
    assert.equal(rows[0]?.ok, 1);
  });

  assert.deepEqual(await counts(), before);
  const leftovers = await queryRows(
    db.connectionString,
    `SELECT slug FROM catalog_services WHERE slug IN ('test-nuevo-a', 'test-choque')
     UNION ALL
     SELECT slug FROM catalog_plans WHERE slug IN ('test-nuevo-a-plan', 'test-choque-plan')`,
  );
  assert.deepEqual(leftovers, [], 'ninguna fila nueva del lote');
});
