// RF-004-07, RNF-004-04, RN-004-06, CA-004-11: el catálogo versionado (seeds/catalog.json) es válido, tiene
// las seis plataformas decididas en la spec 004 y db:seed lo carga de forma idempotente.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { validateCatalog, type CatalogData } from '../src/seed-catalog.ts';
import { seed } from '../src/seed.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const quiet = (): void => undefined;
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../seeds/', import.meta.url));
const SERVICES = ['netflix', 'spotify', 'disney-plus', 'youtube-premium', 'max', 'prime-video'];

let catalog: CatalogData;
let db: TempDatabase;

before(async () => {
  const raw = await readFile(new URL('../seeds/catalog.json', import.meta.url), 'utf8');
  catalog = validateCatalog(JSON.parse(raw));
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

test('RF-004-07, RNF-004-04: catalog.json versionado pasa la validación y trae las seis plataformas de la spec', () => {
  assert.deepEqual(
    catalog.services.map((service) => service.slug),
    SERVICES,
  );
  for (const service of catalog.services) {
    assert.ok(service.plans.length > 0, `${service.slug} no tiene planes`);
  }
});

test('RN-004-06: cada plan tiene fecha de verificación y una fuente oficial https', () => {
  for (const service of catalog.services) {
    for (const plan of service.plans) {
      assert.match(plan.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, plan.slug);
      assert.match(plan.verifiedSource, /^https:\/\//, plan.slug);
    }
  }
});

test('CA-004-05: db:seed carga el catálogo real y una segunda ejecución no cambia nada', async () => {
  const first = await seed({ connectionString: db.connectionString, seedsDir, log: quiet });
  const plans = catalog.services.reduce((total, service) => total + service.plans.length, 0);
  assert.deepEqual(first.catalog, { services: SERVICES.length, plans });

  const snapshot = (): Promise<unknown[]> =>
    queryRows(db.connectionString, 'SELECT to_jsonb(p) AS row FROM catalog_plans p ORDER BY slug');
  const before = await snapshot();
  await seed({ connectionString: db.connectionString, seedsDir, log: quiet });
  assert.deepEqual(await snapshot(), before);
});

test('CA-004-11: el precio individual de referencia se guarda cuando existe y queda vacío si no', async () => {
  const rows = await queryRows<{ slug: string; individual_price_cents: string | null }>(
    db.connectionString,
    'SELECT slug, individual_price_cents FROM catalog_plans ORDER BY slug',
  );
  const bySlug = new Map(rows.map((row) => [row.slug, row.individual_price_cents]));
  for (const service of catalog.services) {
    for (const plan of service.plans) {
      const stored = bySlug.get(plan.slug);
      const expected = plan.individualPriceCents ?? null;
      assert.equal(stored === null ? null : Number(stored), expected, plan.slug);
    }
  }
});
