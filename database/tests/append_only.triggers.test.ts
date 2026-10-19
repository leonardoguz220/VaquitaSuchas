// RF-000-07 (data-model.md §1 "Tablas de solo anexado" y §4 `append_only.triggers`): las tablas de
// solo anexado llevan el disparador forbid_update_delete() y rechazan UPDATE y DELETE con
// 'append-only table' (restrict_violation, 23001). Hoy la única es rate_limit_events.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const RESTRICT_VIOLATION = '23001';
const quiet = (): void => undefined;

// Bits de pg_trigger.tgtype (src/include/catalog/pg_trigger.h).
const TRIGGER_ROW = 1;
const TRIGGER_BEFORE = 2;
const TRIGGER_DELETE = 8;
const TRIGGER_UPDATE = 16;

const keyHash = createHmac('sha256', 'test-only-key').update('x').digest('hex');

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    log: quiet,
  });
});

after(async () => {
  await db?.drop();
});

interface PgError {
  code?: string;
  message?: string;
}

const appendOnlyError = (error: PgError): boolean => {
  assert.equal(error.code, RESTRICT_VIOLATION);
  assert.equal(error.message, 'append-only table');
  return true;
};

interface EventRow {
  id: string;
  bucket: string;
  key_hash: string;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
}

test('RF-000-07: UPDATE y DELETE sobre rate_limit_events fallan y la fila queda intacta', async () => {
  const [inserted] = await queryRows<EventRow>(
    db.connectionString,
    'INSERT INTO rate_limit_events (bucket, key_hash) VALUES ($1, $2) RETURNING *',
    ['login_fail:email', keyHash],
  );
  assert.ok(inserted);

  await assert.rejects(
    queryRows(db.connectionString, `UPDATE rate_limit_events SET bucket = 'other' WHERE id = $1`, [
      inserted.id,
    ]),
    appendOnlyError,
  );
  await assert.rejects(
    queryRows(db.connectionString, 'DELETE FROM rate_limit_events WHERE id = $1', [inserted.id]),
    appendOnlyError,
  );

  const rows = await queryRows<EventRow>(
    db.connectionString,
    'SELECT * FROM rate_limit_events WHERE id = $1',
    [inserted.id],
  );
  assert.deepEqual(rows, [inserted]);
});

test('RF-000-07: toda tabla con forbid_update_delete lo tiene BEFORE UPDATE OR DELETE FOR EACH ROW y activo', async () => {
  const triggers = await queryRows<{ table_name: string; tgtype: number; tgenabled: string }>(
    db.connectionString,
    `SELECT c.relname AS table_name, t.tgtype, t.tgenabled
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal
       AND t.tgfoid = 'public.forbid_update_delete()'::regprocedure
     ORDER BY c.relname`,
  );

  // Lista de tablas de solo anexado del modelo. Al agregar una (p. ej. la auditoría de la spec
  // 009), se suma aquí y en la prueba de comportamiento de abajo.
  assert.deepEqual(
    triggers.map((t) => t.table_name),
    ['rate_limit_events'],
  );

  for (const { table_name, tgtype, tgenabled } of triggers) {
    const has = (bit: number): boolean => (tgtype & bit) === bit;
    assert.ok(has(TRIGGER_ROW), `${table_name}: el disparador debe ser FOR EACH ROW`);
    assert.ok(has(TRIGGER_BEFORE), `${table_name}: el disparador debe ser BEFORE`);
    assert.ok(has(TRIGGER_UPDATE), `${table_name}: el disparador debe cubrir UPDATE`);
    assert.ok(has(TRIGGER_DELETE), `${table_name}: el disparador debe cubrir DELETE`);
    assert.notEqual(tgenabled, 'D', `${table_name}: el disparador no debe estar desactivado`);
  }
});

// Los disparadores FOR EACH ROW solo se disparan si hay filas: esta prueba usa las que dejan las
// pruebas anteriores del archivo (node:test las corre en orden). Una tabla de solo anexado nueva
// necesita su insert en una prueba previa, o esta falla diciendo cuál.
test('RF-000-07: cada tabla de solo anexado rechaza UPDATE y DELETE sobre una fila existente', async () => {
  const tables = await queryRows<{ table_name: string }>(
    db.connectionString,
    `SELECT DISTINCT c.relname AS table_name
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal
       AND t.tgfoid = 'public.forbid_update_delete()'::regprocedure
     ORDER BY 1`,
  );
  assert.ok(tables.length > 0, 'debe haber al menos una tabla de solo anexado');

  for (const { table_name } of tables) {
    const [{ count }] = (await queryRows<{ count: string }>(
      db.connectionString,
      `SELECT count(*) AS count FROM "${table_name}"`,
    )) as [{ count: string }];
    assert.ok(Number(count) > 0, `${table_name} necesita al menos una fila para la prueba`);

    await assert.rejects(
      queryRows(db.connectionString, `UPDATE "${table_name}" SET created_at = created_at`),
      appendOnlyError,
      `${table_name}: UPDATE debe fallar`,
    );
    await assert.rejects(
      queryRows(db.connectionString, `DELETE FROM "${table_name}"`),
      appendOnlyError,
      `${table_name}: DELETE debe fallar`,
    );
  }
});
