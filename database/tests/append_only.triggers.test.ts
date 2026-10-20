// RF-000-07 (data-model.md §1 "Tablas de solo anexado" y §4 `append_only.triggers`): las tablas de
// solo anexado llevan el disparador forbid_update_delete() y rechazan UPDATE y DELETE con
// 'append-only table' (restrict_violation, 23001). Hoy son rate_limit_events (spec 000),
// charge_events (spec 002, RNF-002-04), join_request_events (spec 010), listing_reports
// (spec 008, RNF-008-06) y admin_audit_log (spec 009, CA-009-19).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
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
    [
      'admin_audit_log',
      'charge_events',
      'join_request_events',
      'listing_reports',
      'rate_limit_events',
    ],
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

// charge_events necesita un cobro, un ciclo y un grupo. Para esta prueba basta una fila: se inserta
// con session_replication_role = replica SOLO en esta transacción, lo que omite las FK al insertar.
// El UPDATE y el DELETE de la prueba siguiente corren con el rol normal: el disparador de solo
// anexado se verifica igual. Las FK y CHECK de charge_events los cubre billing.integrity.test.ts.
test('RNF-002-04, CA-010-35, RNF-008-06, CA-009-19: se inserta una fila en charge_events, join_request_events, listing_reports y admin_audit_log para la prueba de solo anexado', async () => {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query(
      `INSERT INTO charge_events (charge_id, group_id, type, actor_kind)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'generado', 'sistema')`,
    );
    // join_request_events (spec 010, CA-010-35): misma técnica, sin la solicitud real.
    await client.query(
      `INSERT INTO join_request_events (request_id, type, actor_kind)
       VALUES (gen_random_uuid(), 'abierta', 'sistema')`,
    );
    // listing_reports (spec 008, RNF-008-06): misma técnica, sin la publicación real.
    await client.query(
      `INSERT INTO listing_reports (listing_id, reporter_id, reason)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'spam')`,
    );
    // admin_audit_log (spec 009, CA-009-19): misma técnica, sin el administrador real.
    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type)
       VALUES (gen_random_uuid(), 'usuario_banear', 'user')`,
    );
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
  const [{ count }] = (await queryRows<{ count: string }>(
    db.connectionString,
    `SELECT (SELECT count(*) FROM charge_events) + (SELECT count(*) FROM join_request_events)
            + (SELECT count(*) FROM listing_reports) + (SELECT count(*) FROM admin_audit_log)
            AS count`,
  )) as [{ count: string }];
  assert.equal(Number(count), 4);
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
