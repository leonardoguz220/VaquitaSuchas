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
});
