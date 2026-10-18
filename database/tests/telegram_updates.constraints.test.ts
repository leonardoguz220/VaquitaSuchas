// RF-000-22 (data-model.md §3, research.md R2): telegram_updates deduplica las actualizaciones
// del bot de Telegram por su update_id natural, que Telegram puede reenviar.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;
const UNIQUE_VIOLATION = '23505';

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

interface UpdateRow {
  update_id: string;
  received_at: Date;
  created_at: Date;
  updated_at: Date;
}

test('RF-000-22: inserta una actualización con received_at, created_at y updated_at por defecto', async () => {
  const rows = await queryRows<UpdateRow>(
    db.connectionString,
    'INSERT INTO telegram_updates (update_id) VALUES (1001) RETURNING *',
  );
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.update_id, '1001');
  assert.ok(row.received_at instanceof Date);
  assert.ok(row.created_at instanceof Date);
  assert.ok(row.updated_at instanceof Date);
});

test('RF-000-22: el mismo update_id no se puede insertar dos veces (23505)', async () => {
  await queryRows(db.connectionString, 'INSERT INTO telegram_updates (update_id) VALUES (2002)');
  await assert.rejects(
    queryRows(db.connectionString, 'INSERT INTO telegram_updates (update_id) VALUES (2002)'),
    (error: unknown) => error instanceof pg.DatabaseError && error.code === UNIQUE_VIOLATION,
  );
});

test('RF-000-22: ON CONFLICT (update_id) DO NOTHING devuelve 0 filas en la repetición (webhook, plan §5)', async () => {
  const sql =
    'INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT (update_id) DO NOTHING RETURNING update_id';
  const first = await queryRows<{ update_id: string }>(db.connectionString, sql, [3003]);
  const second = await queryRows<{ update_id: string }>(db.connectionString, sql, [3003]);
  assert.deepEqual(first, [{ update_id: '3003' }]);
  assert.deepEqual(second, []);
});

test('RF-000-22: update_id es bigint y admite valores mayores a 2^31', async () => {
  const big = '9007199254740993'; // > 2^53, se pasa como texto para no perder precisión
  const rows = await queryRows<{ update_id: string }>(
    db.connectionString,
    'INSERT INTO telegram_updates (update_id) VALUES ($1) RETURNING update_id',
    [big],
  );
  assert.deepEqual(rows, [{ update_id: big }]);
  const type = await queryRows<{ data_type: string }>(
    db.connectionString,
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'telegram_updates' AND column_name = 'update_id'`,
  );
  assert.deepEqual(type, [{ data_type: 'bigint' }]);
});

test('RF-000-22: UPDATE actualiza updated_at con el disparador set_updated_at', async () => {
  await queryRows(
    db.connectionString,
    "INSERT INTO telegram_updates (update_id, created_at, updated_at) VALUES (4004, now() - interval '1 day', now() - interval '1 day')",
  );
  const before = await queryRows<UpdateRow>(
    db.connectionString,
    'SELECT * FROM telegram_updates WHERE update_id = 4004',
  );
  const updated = await queryRows<UpdateRow>(
    db.connectionString,
    "UPDATE telegram_updates SET received_at = now() - interval '1 hour' WHERE update_id = 4004 RETURNING *",
  );
  assert.ok(updated[0]!.updated_at.getTime() > before[0]!.updated_at.getTime());
  assert.equal(updated[0]!.created_at.getTime(), before[0]!.created_at.getTime());
});
