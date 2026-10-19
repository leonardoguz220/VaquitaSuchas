// RF-000-07 y RN-000-01 (data-model.md §1 y §4 `schema.conventions`): convenciones que todo el
// esquema public respeta tras aplicar database/migrations/. Cada verificación es una consulta al
// catálogo que devuelve las violaciones; la última prueba crea tablas que las rompen a propósito
// (dentro de una transacción que se revierte) para comprobar que cada verificación las detecta.
//
// schema_migrations queda fuera de toda la prueba: la crea el ejecutor y usa applied_at en lugar
// de created_at/updated_at (data-model.md §1, excepción documentada).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const quiet = (): void => undefined;

// Tablas con clave primaria natural definida por el modelo congelado, exentas de `id uuid`.
// Se verifica que la columna indicada sea la PK. Agregar una entrada requiere que data-model.md
// de la spec correspondiente la defina así.
//  - telegram_updates: PK update_id bigint (data-model.md §3, research.md R2; hallazgo F1).
const NATURAL_KEY_TABLES: Readonly<Record<string, string>> = {
  telegram_updates: 'update_id',
};

// Claves foráneas que pueden borrar en cascada ('tabla.restricción'). Ningún historial se borra en
// cascada (data-model.md §1, "Claves foráneas"); cada excepción la justifica el modelo de su spec:
//  - tokens de verificación y de recuperación: datos técnicos descartables de la cuenta
//    (specs/003-usuarios-y-autenticacion/data-model.md §1).
const CASCADE_FK_EXCEPTIONS: readonly string[] = [
  'phone_verification_tokens.phone_verification_tokens_user_id_fkey',
  'password_reset_tokens.password_reset_tokens_user_id_fkey',
];

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const EXCLUDED = 'schema_migrations';

type Queryable = Pick<pg.Client, 'query'>;

async function rows<T extends pg.QueryResultRow>(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

// Tablas ordinarias y particionadas del esquema public, salvo schema_migrations.
const TABLES_SQL = `
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '${EXCLUDED}'`;

// Columnas de esas tablas (sin columnas de sistema ni borradas).
const COLUMNS_SQL = `
  SELECT t.relname AS table_name, a.attname AS column_name, a.attnum,
         format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
         pg_get_expr(d.adbin, d.adrelid) AS default_expr,
         ty.typname, ty.typtype, ty.typcategory, el.typname AS elem_typname, el.typtype AS elem_typtype,
         a.atttypmod
  FROM (${TABLES_SQL}) t
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type ty ON ty.oid = a.atttypid
  LEFT JOIN pg_type el ON el.oid = ty.typelem AND ty.typcategory = 'A'
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum`;

interface ColumnRow {
  table_name: string;
  column_name: string;
  attnum: number;
  type: string;
  not_null: boolean;
  default_expr: string | null;
  typname: string;
  typtype: string;
  elem_typname: string | null;
  elem_typtype: string | null;
  atttypmod: number;
}

const columns = (db: Queryable): Promise<ColumnRow[]> =>
  rows<ColumnRow>(db, `${COLUMNS_SQL} ORDER BY t.relname, a.attnum`);

async function tableNames(db: Queryable): Promise<string[]> {
  const result = await rows<{ relname: string }>(db, `${TABLES_SQL} ORDER BY c.relname`);
  return result.map((r) => r.relname);
}

// Columnas de la clave primaria de cada tabla, en orden.
async function primaryKeys(db: Queryable): Promise<Map<string, string[]>> {
  const result = await rows<{ table_name: string; cols: string[] }>(
    db,
    `SELECT t.relname AS table_name,
            array_agg(a.attname ORDER BY k.ord)::text[] AS cols
     FROM (${TABLES_SQL}) t
     JOIN pg_index i ON i.indrelid = t.oid AND i.indisprimary
     CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
     GROUP BY t.relname`,
  );
  return new Map(result.map((r) => [r.table_name, r.cols]));
}

// --- Verificaciones: cada una devuelve una lista de violaciones legibles. ----------------------

async function primaryKeyViolations(db: Queryable): Promise<string[]> {
  // Secuencial: un mismo pg.Client no admite consultas concurrentes.
  const tables = await tableNames(db);
  const pks = await primaryKeys(db);
  const cols = await columns(db);
  const problems: string[] = [];
  for (const table of tables) {
    const pk = pks.get(table) ?? [];
    const natural = NATURAL_KEY_TABLES[table];
    if (natural !== undefined) {
      if (pk.length !== 1 || pk[0] !== natural) {
        problems.push(
          `${table}: su clave natural debe ser la PK (${natural}), es (${pk.join(', ')})`,
        );
      }
      continue;
    }
    const id = cols.find((c) => c.table_name === table && c.column_name === 'id');
    if (pk.length !== 1 || pk[0] !== 'id') {
      problems.push(`${table}: la PK debe ser id uuid, es (${pk.join(', ') || 'sin PK'})`);
    } else if (id?.type !== 'uuid' || id.default_expr !== 'gen_random_uuid()') {
      problems.push(
        `${table}: id debe ser uuid DEFAULT gen_random_uuid(), es ${id?.type} DEFAULT ${id?.default_expr}`,
      );
    }
  }
  return problems;
}

async function timestampColumnViolations(db: Queryable): Promise<string[]> {
  const tables = await tableNames(db);
  const cols = await columns(db);
  const problems: string[] = [];
  for (const table of tables) {
    for (const name of ['created_at', 'updated_at']) {
      const col = cols.find((c) => c.table_name === table && c.column_name === name);
      if (!col) {
        problems.push(`${table}: falta ${name}`);
      } else if (
        col.type !== 'timestamp with time zone' ||
        !col.not_null ||
        col.default_expr !== 'now()'
      ) {
        problems.push(`${table}.${name}: debe ser timestamptz NOT NULL DEFAULT now()`);
      }
    }
  }
  return problems;
}

// RF-000-07 (dinero) y RN-000-01 (fechas en UTC): tipos prohibidos, también como arreglos.
const FORBIDDEN_TYPES: Readonly<Record<string, string>> = {
  float4: 'real',
  float8: 'double precision',
  timestamp: 'timestamp without time zone',
  money: 'money',
};

async function forbiddenTypeViolations(db: Queryable): Promise<string[]> {
  const problems: string[] = [];
  for (const col of await columns(db)) {
    const base = col.elem_typname ?? col.typname;
    const where = `${col.table_name}.${col.column_name}`;
    const forbidden = FORBIDDEN_TYPES[base];
    if (forbidden) problems.push(`${where}: usa ${forbidden} (${col.type})`);
    // numeric sin precisión ni escala: atttypmod = -1.
    if (base === 'numeric' && col.atttypmod === -1) {
      problems.push(`${where}: usa numeric sin escala`);
    }
  }
  return problems;
}

async function moneyColumnViolations(db: Queryable): Promise<string[]> {
  return (await columns(db))
    .filter((c) => c.column_name.endsWith('_cents') && c.type !== 'bigint')
    .map(
      (c) => `${c.table_name}.${c.column_name}: una columna _cents debe ser bigint, es ${c.type}`,
    );
}

async function enumViolations(db: Queryable): Promise<string[]> {
  const types = await rows<{ typname: string }>(
    db,
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
  );
  const problems = types.map((t) => `tipo ENUM ${t.typname}: los estados usan text + CHECK`);
  for (const col of await columns(db)) {
    if (col.typtype === 'e' || col.elem_typtype === 'e') {
      problems.push(`${col.table_name}.${col.column_name}: usa el ENUM ${col.type}`);
    }
  }
  return problems;
}

async function statusColumnViolations(db: Queryable): Promise<string[]> {
  const checks = await rows<{ table_name: string; conkey: number[] }>(
    db,
    `SELECT t.relname AS table_name, con.conkey::int[] AS conkey
     FROM (${TABLES_SQL}) t
     JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype = 'c'`,
  );
  const problems: string[] = [];
  for (const col of await columns(db)) {
    if (col.column_name !== 'status' && !col.column_name.endsWith('_status')) continue;
    const where = `${col.table_name}.${col.column_name}`;
    if (col.type !== 'text') problems.push(`${where}: un estado debe ser text, es ${col.type}`);
    const checked = checks.some(
      (c) => c.table_name === col.table_name && c.conkey.includes(col.attnum),
    );
    if (!checked) problems.push(`${where}: un estado necesita un CHECK con los valores de la spec`);
  }
  return problems;
}

async function updatedAtTriggerViolations(db: Queryable): Promise<string[]> {
  const result = await rows<{ table_name: string }>(
    db,
    `SELECT t.relname AS table_name
     FROM (${TABLES_SQL}) t
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_trigger tg
       WHERE tg.tgrelid = t.oid AND NOT tg.tgisinternal AND tg.tgenabled <> 'D'
         AND tg.tgfoid = 'public.set_updated_at()'::regprocedure
         AND (tg.tgtype & 1) = 1    -- FOR EACH ROW
         AND (tg.tgtype & 2) = 2    -- BEFORE
         AND (tg.tgtype & 16) = 16  -- UPDATE
     )
     ORDER BY 1`,
  );
  return result.map(
    (r) => `${r.table_name}: falta el disparador BEFORE UPDATE FOR EACH ROW con set_updated_at()`,
  );
}

async function cascadeForeignKeyViolations(db: Queryable): Promise<string[]> {
  const result = await rows<{ table_name: string; conname: string }>(
    db,
    `SELECT t.relname AS table_name, con.conname
     FROM (${TABLES_SQL}) t
     JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype = 'f' AND con.confdeltype = 'c'
     ORDER BY 1, 2`,
  );
  return result
    .filter((r) => !CASCADE_FK_EXCEPTIONS.includes(`${r.table_name}.${r.conname}`))
    .map((r) => `${r.table_name}.${r.conname}: ON DELETE CASCADE borraría historial`);
}

async function snakeCaseViolations(db: Queryable): Promise<string[]> {
  const problems = (await tableNames(db))
    .filter((name) => !SNAKE_CASE.test(name))
    .map((name) => `tabla "${name}": no está en snake_case`);
  for (const col of await columns(db)) {
    if (!SNAKE_CASE.test(col.column_name)) {
      problems.push(`${col.table_name}."${col.column_name}": no está en snake_case`);
    }
  }
  return problems;
}

// --- Pruebas ------------------------------------------------------------------------------------

let db: TempDatabase;
let client: pg.Client;

before(async () => {
  db = await createTempDatabase();
  await migrate({
    connectionString: db.connectionString,
    migrationsDir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    log: quiet,
  });
  client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
});

after(async () => {
  await client?.end();
  await db?.drop();
});

test('RF-000-07: la prueba revisa las tablas del modelo (no pasa en vacío)', async () => {
  const tables = await tableNames(client);
  for (const expected of ['job_runs', 'rate_limit_events', 'telegram_updates']) {
    assert.ok(tables.includes(expected), `falta la tabla ${expected}`);
  }
  assert.ok(!tables.includes(EXCLUDED));
  for (const table of Object.keys(NATURAL_KEY_TABLES)) {
    assert.ok(tables.includes(table), `NATURAL_KEY_TABLES nombra ${table}, que no existe`);
  }
});

test('RN-000-01: la base trabaja en UTC y now() se guarda como el instante UTC', async () => {
  const [setting] = await rows<{ tz: string }>(client, "SELECT current_setting('TimeZone') AS tz");
  assert.ok(['UTC', 'Etc/UTC'].includes(setting?.tz ?? ''), `TimeZone es ${setting?.tz}`);
  const [sample] = await rows<{ offset: string }>(client, "SELECT to_char(now(), 'OF') AS offset");
  assert.equal(sample?.offset, '+00');
});

test('RF-000-07: toda tabla tiene PK id uuid DEFAULT gen_random_uuid(), salvo las de clave natural', async () => {
  assert.deepEqual(await primaryKeyViolations(client), []);
});

test('RF-000-07: toda tabla tiene created_at y updated_at timestamptz NOT NULL DEFAULT now()', async () => {
  assert.deepEqual(await timestampColumnViolations(client), []);
});

test('RF-000-07, RN-000-01: ninguna columna es real, double precision, timestamp sin zona, money ni numeric sin escala', async () => {
  assert.deepEqual(await forbiddenTypeViolations(client), []);
});

test('RF-000-07: toda columna _cents es bigint', async () => {
  assert.deepEqual(await moneyColumnViolations(client), []);
});

test('RF-000-07: no hay tipos ENUM; los estados son text con CHECK', async () => {
  assert.deepEqual(await enumViolations(client), []);
  assert.deepEqual(await statusColumnViolations(client), []);
});

test('RF-000-07: toda tabla con updated_at tiene el disparador BEFORE UPDATE con set_updated_at()', async () => {
  assert.deepEqual(await updatedAtTriggerViolations(client), []);
});

test('RF-000-07: ninguna clave foránea borra en cascada', async () => {
  assert.deepEqual(await cascadeForeignKeyViolations(client), []);
});

test('RF-000-07: tablas y columnas en snake_case', async () => {
  assert.deepEqual(await snakeCaseViolations(client), []);
});

test('RF-000-07, RN-000-01: cada verificación detecta un esquema que la rompe', async () => {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TYPE bad_state AS ENUM ('a', 'b');
      CREATE TABLE bad_things (
        thing_no serial PRIMARY KEY,
        price_cents integer NOT NULL,
        amount real,
        ratio double precision,
        loose numeric,
        cash money,
        happened_at timestamp,
        moments timestamp[],
        status varchar(10),
        payment_status text,
        mood bad_state,
        "camelCase" text,
        job_run_id uuid REFERENCES job_runs (id) ON DELETE CASCADE,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE bad_no_trigger (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "BadName" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TRIGGER bad_name_set_updated_at BEFORE UPDATE ON "BadName"
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    const includes = (problems: string[], ...fragments: string[]): void => {
      for (const fragment of fragments) {
        assert.ok(
          problems.some((p) => p.includes(fragment)),
          `se esperaba una violación con "${fragment}" en: ${JSON.stringify(problems)}`,
        );
      }
    };

    const pk = await primaryKeyViolations(client);
    includes(pk, 'bad_things: la PK debe ser id uuid', 'bad_no_trigger: id debe ser uuid DEFAULT');
    includes(
      await timestampColumnViolations(client),
      'bad_things: falta updated_at',
      'bad_things.created_at',
    );
    includes(
      await forbiddenTypeViolations(client),
      'bad_things.amount: usa real',
      'bad_things.ratio: usa double precision',
      'bad_things.loose: usa numeric sin escala',
      'bad_things.cash: usa money',
      'bad_things.happened_at: usa timestamp without time zone',
      'bad_things.moments: usa timestamp without time zone',
      'bad_things.created_at: usa timestamp without time zone',
    );
    includes(await moneyColumnViolations(client), 'bad_things.price_cents');
    includes(await enumViolations(client), 'tipo ENUM bad_state', 'bad_things.mood');
    includes(
      await statusColumnViolations(client),
      'bad_things.status: un estado debe ser text',
      'bad_things.status: un estado necesita un CHECK',
      'bad_things.payment_status: un estado necesita un CHECK',
    );
    includes(await updatedAtTriggerViolations(client), 'bad_no_trigger');
    includes(await cascadeForeignKeyViolations(client), 'bad_things.bad_things_job_run_id_fkey');
    includes(await snakeCaseViolations(client), 'tabla "BadName"', 'bad_things."camelCase"');

    // Las tablas del modelo no aparecen entre las violaciones.
    const all = [
      ...pk,
      ...(await timestampColumnViolations(client)),
      ...(await updatedAtTriggerViolations(client)),
    ];
    for (const table of ['job_runs', 'rate_limit_events', 'telegram_updates']) {
      assert.ok(!all.some((p) => p.startsWith(`${table}:`)), `${table} no debería violar nada`);
    }
  } finally {
    await client.query('ROLLBACK');
  }
});
