// RF-004-04 (data-model.md §1): 0021_catalog_search.sql crea la vista catalog_service_search
// con id, name_key y category_key normalizados con immutable_unaccent(lower(...)), para que
// la búsqueda del catálogo no distinga mayúsculas ni tildes.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

let db: TempDatabase;
const ids: Record<string, string> = {};

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  const services: [slug: string, name: string, category: string, active: boolean][] = [
    ['musica-libre', 'Música Libre', 'musica', true],
    ['video-nandu', 'Video Ñandú', 'video', true],
    ['juegos-xl', 'Juegos XL', 'juegos', true],
    ['video-retirado', 'Video Retirado', 'video', false],
  ];
  for (const [slug, name, category, active] of services) {
    const rows = await queryRows<{ id: string }>(
      db.connectionString,
      `INSERT INTO catalog_services (slug, name, category, is_active)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [slug, name, category, active],
    );
    ids[slug] = rows[0]!.id;
  }
});

after(async () => {
  await db?.drop();
});

function searchByName(term: string): Promise<{ id: string }[]> {
  return queryRows<{ id: string }>(
    db.connectionString,
    `SELECT id FROM catalog_service_search
     WHERE name_key LIKE '%' || immutable_unaccent(lower($1)) || '%'
     ORDER BY id`,
    [term],
  );
}

test('RF-004-04: la vista expone exactamente las columnas id, name_key y category_key', async () => {
  const rows = await queryRows<{ column_name: string; data_type: string }>(
    db.connectionString,
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'catalog_service_search'
     ORDER BY ordinal_position`,
  );
  assert.deepEqual(rows, [
    { column_name: 'id', data_type: 'uuid' },
    { column_name: 'name_key', data_type: 'text' },
    { column_name: 'category_key', data_type: 'text' },
  ]);
  const views = await queryRows<{ table_type: string }>(
    db.connectionString,
    `SELECT table_type FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'catalog_service_search'`,
  );
  assert.deepEqual(views, [{ table_type: 'VIEW' }]);
});

test('RF-004-04: name_key y category_key quedan en minúsculas y sin tildes', async () => {
  const rows = await queryRows<{ name_key: string; category_key: string }>(
    db.connectionString,
    'SELECT name_key, category_key FROM catalog_service_search WHERE id = $1',
    [ids['video-nandu']],
  );
  assert.deepEqual(rows, [{ name_key: 'video nandu', category_key: 'video' }]);
});

test('RF-004-04: buscar "MUSICA" sin tilde y en mayúsculas encuentra "Música Libre"', async () => {
  assert.deepEqual(await searchByName('MUSICA'), [{ id: ids['musica-libre'] }]);
});

test('RF-004-04: buscar "nandu" encuentra "Video Ñandú"', async () => {
  assert.deepEqual(await searchByName('nandu'), [{ id: ids['video-nandu'] }]);
});

test('RF-004-04: buscar con tildes ("Ñandú") también encuentra "Video Ñandú"', async () => {
  assert.deepEqual(await searchByName('Ñandú'), [{ id: ids['video-nandu'] }]);
});

test('RF-004-04: filtrar por category_key "video" devuelve solo servicios de video', async () => {
  const rows = await queryRows<{ id: string }>(
    db.connectionString,
    `SELECT id FROM catalog_service_search
     WHERE category_key = immutable_unaccent(lower($1))`,
    ['VIDEO'],
  );
  const expected = [ids['video-nandu'], ids['video-retirado']].sort();
  assert.deepEqual(rows.map((row) => row.id).sort(), expected);
});

// La vista no filtra por is_active a propósito (data-model.md §1): el filtro de servicios
// activos y con planes activos (RF-004-06, RN-004-05) lo hace la consulta del backend al unir
// la vista con catalog_services.
test('RF-004-04: los servicios inactivos también aparecen en la vista', async () => {
  assert.deepEqual(await searchByName('retirado'), [{ id: ids['video-retirado'] }]);
  const total = await queryRows<{ count: string }>(
    db.connectionString,
    'SELECT count(*) FROM catalog_service_search',
  );
  assert.equal(total[0]?.count, '4');
});
