// RF-000-06: `db:seed` ejecuta database/seeds/NNNN_*.sql en orden, en una sola transacción y de
// forma repetible; RF-009-02: ningún seed lleva contraseñas.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { mentionsPassword, seed, SeedError } from '../src/seed.ts';
import { createTempDatabase, queryRows, tableExists } from './helpers/temp-db.ts';
import { createMigrationsDir } from './helpers/temp-migrations.ts';

const quiet = (): void => undefined;

const SCHEMA = 'CREATE TABLE fruit (slug text PRIMARY KEY, label text NOT NULL, position integer);';

async function migratedDatabase(t: test.TestContext) {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  const migrations = await createMigrationsDir({ '0001_fruit.sql': SCHEMA });
  t.after(() => migrations.remove());
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: migrations.path,
    log: quiet,
  });
  return db;
}

test('RF-000-06: el seed aplica los archivos en orden numérico y dos ejecuciones no duplican filas', async (t) => {
  const db = await migratedDatabase(t);
  const seeds = await createMigrationsDir({
    // 0002 depende de la fila de 0001: si el orden fuera el de escritura, fallaría.
    '0002_more_fruit.sql': [
      "INSERT INTO fruit (slug, label, position) VALUES ('pear', 'Pera', 2)",
      'ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, position = EXCLUDED.position;',
      "UPDATE fruit SET position = 1 WHERE slug = 'apple';",
    ].join('\n'),
    '0001_fruit.sql':
      "INSERT INTO fruit (slug, label) VALUES ('apple', 'Manzana') ON CONFLICT (slug) DO NOTHING;",
    'README.md': 'no es un seed',
    '0003-Invalid-Name.sql': "INSERT INTO fruit (slug, label) VALUES ('ignored', 'x');",
  });
  t.after(() => seeds.remove());
  const options = { connectionString: db.connectionString, seedsDir: seeds.path, log: quiet };

  const first = await seed(options);
  const second = await seed(options);

  assert.deepEqual(first.applied, ['0001_fruit.sql', '0002_more_fruit.sql']);
  assert.deepEqual(second.applied, first.applied);
  const rows = await queryRows(
    db.connectionString,
    'SELECT slug, position FROM fruit ORDER BY slug',
  );
  assert.deepEqual(rows, [
    { slug: 'apple', position: 1 },
    { slug: 'pear', position: 2 },
  ]);
});

test('RF-000-06: si un seed falla se revierte todo y el error nombra el archivo', async (t) => {
  const db = await migratedDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_fruit.sql': "INSERT INTO fruit (slug, label) VALUES ('apple', 'Manzana');",
    '0002_broken.sql': "INSERT INTO fruit (slug, label) VALUES ('pear', NULL);",
  });
  t.after(() => seeds.remove());

  await assert.rejects(
    seed({ connectionString: db.connectionString, seedsDir: seeds.path, log: quiet }),
    (error: unknown) => {
      assert.ok(error instanceof SeedError);
      assert.equal(error.file, '0002_broken.sql');
      assert.match(error.message, /0002_broken\.sql/);
      return true;
    },
  );
  const rows = await queryRows(db.connectionString, 'SELECT slug FROM fruit');
  assert.deepEqual(rows, [], 'la fila de 0001 también se revierte');
});

test('RF-009-02: un seed que menciona una contraseña se rechaza antes de ejecutar nada', async (t) => {
  const db = await migratedDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_fruit.sql': "INSERT INTO fruit (slug, label) VALUES ('apple', 'Manzana');",
    '0002_admin.sql': [
      '-- Esta línea es un comentario y no cuenta.',
      'CREATE TABLE admins (email text, password_hash text);',
      "INSERT INTO admins VALUES ('admin@example.com', '$argon2id$v=19$m=65536,t=3,p=4$abc');",
    ].join('\n'),
  });
  t.after(() => seeds.remove());

  await assert.rejects(
    seed({ connectionString: db.connectionString, seedsDir: seeds.path, log: quiet }),
    (error: unknown) => {
      assert.ok(error instanceof SeedError);
      assert.equal(error.file, '0002_admin.sql');
      assert.match(error.message, /contraseña/);
      assert.match(error.message, /seed:admin/);
      return true;
    },
  );
  assert.deepEqual(await queryRows(db.connectionString, 'SELECT slug FROM fruit'), []);
  assert.equal(await tableExists(db.connectionString, 'admins'), false);
});

test('RF-009-02: la regla de contraseñas ignora los comentarios del SQL', () => {
  assert.equal(mentionsPassword('-- sin password aquí\nSELECT 1;'), false);
  assert.equal(mentionsPassword('/* la password la crea seed:admin */ SELECT 1;'), false);
  assert.equal(mentionsPassword("UPDATE users SET Password_Hash = 'x';"), true);
});

test('RF-000-06: dos seeds con el mismo número se rechazan antes de ejecutar nada', async (t) => {
  const db = await migratedDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_fruit.sql': "INSERT INTO fruit (slug, label) VALUES ('apple', 'Manzana');",
    '0001_other.sql': "INSERT INTO fruit (slug, label) VALUES ('pear', 'Pera');",
  });
  t.after(() => seeds.remove());

  await assert.rejects(
    seed({ connectionString: db.connectionString, seedsDir: seeds.path, log: quiet }),
    /0001/,
  );
  assert.deepEqual(await queryRows(db.connectionString, 'SELECT slug FROM fruit'), []);
});

test('RF-000-06: el seed real de database/seeds se aplica sobre las migraciones reales, dos veces', async (t) => {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    log: quiet,
  });
  const options = {
    connectionString: db.connectionString,
    seedsDir: fileURLToPath(new URL('../seeds/', import.meta.url)),
    log: quiet,
  };

  const first = await seed(options);
  const second = await seed(options);
  assert.deepEqual(second.applied, first.applied);
  assert.deepEqual(second.catalog, first.catalog);
});

// --- seeds/catalog.json dentro de db:seed (spec 004, RF-004-07, RNF-004-03, CA-004-05, CA-004-06) --
// Datos ficticios de prueba: slugs fict-*, precios inventados y URLs de example.com.

const realMigrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

async function catalogDatabase(t: test.TestContext) {
  const db = await createTempDatabase();
  t.after(() => db.drop());
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: realMigrationsDir,
    log: quiet,
  });
  return db;
}

function fictCatalog() {
  return {
    services: [
      {
        slug: 'fict-video',
        name: 'Ficticio Video',
        category: 'video',
        logoUrl: 'https://example.com/fict-video.png',
        brandColor: '#123456',
        plans: [
          {
            slug: 'fict-video-uno',
            name: 'Plan uno ficticio',
            priceCents: 1234,
            currency: 'USD',
            maxSlots: 3,
            individualPriceCents: 999,
            verifiedOn: '2026-10-18',
            verifiedSource: 'https://example.com/fict-video/precios',
          },
          {
            slug: 'fict-video-dos',
            name: 'Plan dos ficticio',
            priceCents: 2345,
            currency: 'USD',
            maxSlots: 5,
            verifiedOn: '2026-10-18',
            verifiedSource: 'https://example.com/fict-video/precios',
          },
        ],
      },
      {
        slug: 'fict-musica',
        name: 'Ficticio Música',
        category: 'musica',
        plans: [
          {
            slug: 'fict-musica-duo',
            name: 'Dúo ficticio',
            priceCents: 4500,
            currency: 'BS',
            maxSlots: 2,
            verifiedOn: '2026-10-18',
            verifiedSource: 'Referencia ficticia de prueba',
          },
        ],
      },
    ],
  };
}

// Un .sql de prueba que inserta un servicio a mano: sirve para comprobar el todo o nada.
const SQL_SERVICE_SEED =
  "INSERT INTO catalog_services (slug, name, category) VALUES ('fict-sql', 'Ficticio SQL', 'otras') ON CONFLICT (slug) DO NOTHING;";

function catalogRows(connectionString: string): Promise<unknown[]> {
  return queryRows(
    connectionString,
    `SELECT 'service' AS kind, to_jsonb(s) AS row FROM catalog_services s
     UNION ALL
     SELECT 'plan', to_jsonb(p) FROM catalog_plans p
     ORDER BY 1, 2`,
  );
}

async function rejectsInCatalog(
  connectionString: string,
  seedsDir: string,
  message?: RegExp[],
): Promise<void> {
  await assert.rejects(seed({ connectionString, seedsDir, log: quiet }), (error: unknown) => {
    assert.ok(error instanceof SeedError, `se esperaba SeedError: ${error}`);
    assert.equal(error.file, 'catalog.json');
    for (const pattern of message ?? []) assert.match(error.message, pattern);
    return true;
  });
  assert.deepEqual(await catalogRows(connectionString), [], 'no debe quedar ninguna fila');
}

test('RF-004-07, CA-004-05: db:seed carga catalog.json después de los .sql y dos ejecuciones no cambian nada', async (t) => {
  const db = await catalogDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_sql_service.sql': SQL_SERVICE_SEED,
    'catalog.json': JSON.stringify(fictCatalog(), null, 2),
  });
  t.after(() => seeds.remove());
  const options = { connectionString: db.connectionString, seedsDir: seeds.path, log: quiet };

  const first = await seed(options);
  assert.deepEqual(first, {
    applied: ['0001_sql_service.sql'],
    catalog: { services: 2, plans: 3 },
  });
  const plans = await queryRows(
    db.connectionString,
    `SELECT p.slug, s.slug AS service, p.price_cents::int AS price_cents, p.sort_order
     FROM catalog_plans p JOIN catalog_services s ON s.id = p.service_id ORDER BY p.slug`,
  );
  assert.deepEqual(plans, [
    { slug: 'fict-musica-duo', service: 'fict-musica', price_cents: 4500, sort_order: 0 },
    { slug: 'fict-video-dos', service: 'fict-video', price_cents: 2345, sort_order: 1 },
    { slug: 'fict-video-uno', service: 'fict-video', price_cents: 1234, sort_order: 0 },
  ]);
  const snapshot = await catalogRows(db.connectionString);

  const second = await seed(options);
  assert.deepEqual(second, first);
  assert.deepEqual(
    await catalogRows(db.connectionString),
    snapshot,
    'ni ids ni updated_at cambian',
  );
});

test('CA-004-06, RNF-004-03: un catalog.json inválido no aplica nada, tampoco los .sql', async (t) => {
  const db = await catalogDatabase(t);
  const catalog = fictCatalog();
  catalog.services[0]!.plans[1]!.maxSlots = 21;
  const seeds = await createMigrationsDir({
    '0001_sql_service.sql': SQL_SERVICE_SEED,
    'catalog.json': JSON.stringify(catalog),
  });
  t.after(() => seeds.remove());

  await rejectsInCatalog(db.connectionString, seeds.path, [/fict-video-dos/, /maxSlots/]);
});

test('RNF-004-03: un error de la base al escribir catalog.json revierte también los .sql', async (t) => {
  const db = await catalogDatabase(t);
  const catalog = fictCatalog();
  // Mismo nombre que el servicio del .sql con otro slug: choca con catalog_services_name_uq.
  catalog.services[1]!.name = 'Ficticio SQL';
  const seeds = await createMigrationsDir({
    '0001_sql_service.sql': SQL_SERVICE_SEED,
    'catalog.json': JSON.stringify(catalog),
  });
  t.after(() => seeds.remove());

  await rejectsInCatalog(db.connectionString, seeds.path, [/catalog\.json/]);
});

test('RNF-004-03: un plan cuyo slug ya es de otro servicio se rechaza y revierte todo', async (t) => {
  const db = await catalogDatabase(t);
  await queryRows(
    db.connectionString,
    `WITH s AS (INSERT INTO catalog_services (slug, name, category)
                VALUES ('fict-otro', 'Ficticio Otro', 'otras') RETURNING id)
     INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots)
     SELECT id, 'fict-video-uno', 'Plan ajeno ficticio', 100, 'BS', 2 FROM s`,
  );
  const before = await catalogRows(db.connectionString);
  const seeds = await createMigrationsDir({ 'catalog.json': JSON.stringify(fictCatalog()) });
  t.after(() => seeds.remove());

  await assert.rejects(
    seed({ connectionString: db.connectionString, seedsDir: seeds.path, log: quiet }),
    (error: unknown) => {
      assert.ok(error instanceof SeedError);
      assert.equal(error.file, 'catalog.json');
      assert.match(error.message, /fict-video-uno/);
      assert.match(error.message, /fict-otro/);
      return true;
    },
  );
  assert.deepEqual(await catalogRows(db.connectionString), before, 'nada cambia');
});

test('RF-009-02: un catalog.json que menciona una contraseña se rechaza antes de ejecutar nada', async (t) => {
  const db = await catalogDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_sql_service.sql': SQL_SERVICE_SEED,
    'catalog.json': JSON.stringify({ ...fictCatalog(), password: 'no-va-aqui' }),
  });
  t.after(() => seeds.remove());

  await rejectsInCatalog(db.connectionString, seeds.path, [/contraseña/]);
});

test('RF-004-07: un catalog.json que no es JSON se rechaza sin aplicar nada', async (t) => {
  const db = await catalogDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_sql_service.sql': SQL_SERVICE_SEED,
    'catalog.json': '{ "services": [',
  });
  t.after(() => seeds.remove());

  await rejectsInCatalog(db.connectionString, seeds.path, [/JSON/]);
});

test('RF-000-06: sin catalog.json el seed devuelve catalog null', async (t) => {
  const db = await migratedDatabase(t);
  const seeds = await createMigrationsDir({
    '0001_fruit.sql': "INSERT INTO fruit (slug, label) VALUES ('apple', 'Manzana');",
  });
  t.after(() => seeds.remove());

  const result = await seed({
    connectionString: db.connectionString,
    seedsDir: seeds.path,
    log: quiet,
  });
  assert.deepEqual(result, { applied: ['0001_fruit.sql'], catalog: null });
});
