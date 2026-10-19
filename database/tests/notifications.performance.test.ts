// Spec 005, T032 (RNF-005-05; data-model.md §2 "Consultas frecuentes e índices"): planes de consulta
// de la lista de avisos, el contador de no leídas, la entrega por lotes, la cancelación por entidad
// y la limpieza, con datos de volumen. No hay seed de notificaciones (el seed no admite usuarios con
// contraseña), así que la prueba crea una base temporal migrada con la carpeta real y la llena con
// SQL de conjunto (generate_series). Todos los datos son ficticios: el hash de contraseña no
// corresponde a ninguna contraseña real y las huellas son md5 de textos inventados.
//
// Volumen: 200 usuarios; 1.000 notificaciones del usuario objetivo y 20.000 repartidas entre los
// otros 199, con la mitad leídas y fechas repartidas en los últimos 120 días; 5.000 envíos con
// estados mezclados y solo 100 pendientes. Después se corre ANALYZE.
//
// Los planes se verifican sin forzar al planificador (sin SET enable_seqscan = off). El tiempo de
// RNF-005-05 (< 300 ms) se mide con EXPLAIN ANALYZE: es el tiempo de ejecución en la base, sin red
// ni backend; la medida de punta a punta la cubre backend/test/notifications.list.e2e-spec.ts (T006).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';

const USERS = 200;
const TARGET_NOTIFICATIONS = 1000;
const OTHER_NOTIFICATIONS = 20000;
const DELIVERIES = 5000;
const PENDING_DELIVERIES = 100;

// Umbral de RNF-005-05: listar notificaciones en menos de 300 ms con hasta 1.000 registros.
const LIST_BUDGET_MS = 300;

// ---------------------------------------------------------------- consultas del repositorio

// Lista paginada de avisos de una persona, primera página (RF-005-01). Orden estable por
// created_at y id para que dos avisos del mismo instante no salten de página.
const LIST_FIRST_PAGE_SQL = `
  SELECT id, type, category, title, body, link, read_at, created_at
  FROM notifications
  WHERE user_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 20 OFFSET 0`;

// Lista paginada, página intermedia con cursor (keyset): el cursor es (created_at, id) del último
// aviso de la página anterior.
const LIST_KEYSET_PAGE_SQL = `
  SELECT id, type, category, title, body, link, read_at, created_at
  FROM notifications
  WHERE user_id = $1 AND (created_at, id) < ($2, $3)
  ORDER BY created_at DESC, id DESC
  LIMIT 20`;

// Contador de no leídas de la campana (RF-005-02).
const UNREAD_COUNT_SQL = `
  SELECT count(*) AS unread
  FROM notifications
  WHERE user_id = $1 AND read_at IS NULL`;

// Lote de envíos pendientes que ya tocan, cada 5 minutos (RF-005-20). SKIP LOCKED deja que dos
// instancias de la tarea no tomen el mismo envío.
const DUE_DELIVERIES_SQL = `
  SELECT id, notification_id, channel, attempts, respect_window
  FROM notification_deliveries
  WHERE status = 'pending' AND next_attempt_at <= now()
  ORDER BY next_attempt_at
  LIMIT 50
  FOR UPDATE SKIP LOCKED`;

// Avisos de una entidad (cobro pagado o cancelado, o grupo) para cancelar sus envíos pendientes
// (RN-005-02).
const ENTITY_NOTIFICATIONS_SQL = `
  SELECT id
  FROM notifications
  WHERE entity_type = $1 AND entity_id = $2`;

// Limpieza de los avisos de más de 90 días (RF-005-21). El backend borra antes los envíos (FK
// RESTRICT); aquí solo se mira el plan, sin ejecutar el borrado.
const PURGE_SQL = `
  DELETE FROM notifications
  WHERE created_at < now() - interval '90 days'`;

// ---------------------------------------------------------------- datos de volumen

// Usuarios ficticios con el mismo patrón que defaultUser() de notifications.integrity.test.ts.
const SEED_USERS_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version)
  SELECT 'Persona de Volumen ' || g,
         'volumen' || g || '@example.com',
         md5('email:volumen' || g || '@example.com'),
         $1,
         '\\x01020304'::bytea,
         md5('ci:' || (3000000 + g)),
         '+5917' || lpad(g::text, 7, '0'),
         900000000 + g,
         now(),
         $2
  FROM generate_series(1, $3::int) AS g`;

// Notificaciones de una persona: fechas repartidas en 120 días, la mitad leídas y tres avisos
// por cobro (entity_id) para que la cancelación por entidad devuelva pocas filas.
const SEED_NOTIFICATIONS_SQL = `
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY email) - 1 AS rn FROM users
  )
  INSERT INTO notifications (user_id, type, category, title, body, link, entity_type, entity_id,
                             dedupe_key, read_at, created_at)
  SELECT u.id,
         'cobro_generado',
         'recordatorios',
         'Tu cobro está listo',
         'Tu cuota es Bs 25,50.',
         '/cobros/' || md5('charge:' || $1 || ':' || (g / 3))::uuid,
         'charge',
         md5('charge:' || $1 || ':' || (g / 3))::uuid,
         'cobro_generado:' || $1 || ':' || g,
         CASE WHEN g % 2 = 0 THEN now() - (g % 120) * interval '1 day' + interval '1 hour' END,
         now() - (g % 120) * interval '1 day' - (g % 1440) * interval '1 minute'
  FROM generate_series(1, $2::int) AS g
  JOIN ranked AS u
    ON u.rn = CASE WHEN $3::bool THEN 0 ELSE 1 + g % ($4::int - 1) END`;

// Envíos de las primeras notificaciones: 100 pendientes (la mitad ya vencida), el resto enviados,
// fallidos u omitidos con motivo.
const SEED_DELIVERIES_SQL = `
  INSERT INTO notification_deliveries (notification_id, channel, status, respect_window, attempts,
                                       next_attempt_at, sent_at, last_error, skip_reason)
  SELECT n.id,
         'email',
         s.status,
         true,
         CASE s.status WHEN 'failed' THEN 4 WHEN 'sent' THEN 1 ELSE 0 END,
         CASE WHEN n.rn % 2 = 0 THEN now() - interval '10 minutes' ELSE now() + interval '1 hour' END,
         CASE WHEN s.status = 'sent' THEN now() END,
         CASE WHEN s.status = 'failed' THEN 'timeout' END,
         CASE WHEN s.status = 'skipped' THEN 'preferencia_desactivada' END
  FROM (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM notifications
    LIMIT $1
  ) AS n
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN n.rn <= $2 THEN 'pending'
             WHEN n.rn % 10 = 0 THEN 'failed'
             WHEN n.rn % 10 = 1 THEN 'skipped'
             ELSE 'sent'
           END AS status
  ) AS s`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let targetUserId: string;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();

  await client.query(SEED_USERS_SQL, [FAKE_HASH, POLICY_VERSION, USERS]);
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM users ORDER BY email LIMIT 1',
  );
  assert.ok(rows[0]);
  targetUserId = rows[0].id;

  await client.query(SEED_NOTIFICATIONS_SQL, ['target', TARGET_NOTIFICATIONS, true, USERS]);
  await client.query(SEED_NOTIFICATIONS_SQL, ['others', OTHER_NOTIFICATIONS, false, USERS]);
  await client.query(SEED_DELIVERIES_SQL, [DELIVERIES, PENDING_DELIVERIES]);
  await client.query('ANALYZE users, notifications, notification_deliveries');
});

after(async () => {
  await client?.end();
  await db?.drop();
});

// ---------------------------------------------------------------- lectura de planes

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainResult {
  Plan: PlanNode;
  'Execution Time'?: number;
}

async function explain(sql: string, params: unknown[], analyze: boolean): Promise<ExplainResult> {
  const options = analyze ? 'ANALYZE, FORMAT JSON' : 'FORMAT JSON';
  const { rows } = await client.query<{ 'QUERY PLAN': unknown }>(
    `EXPLAIN (${options}) ${sql}`,
    params,
  );
  const raw = rows[0]?.['QUERY PLAN'];
  const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ExplainResult[];
  assert.ok(parsed[0]);
  return parsed[0];
}

function walk(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(walk)];
}

const INDEX_NODE_TYPES = new Set(['Index Scan', 'Index Only Scan', 'Bitmap Index Scan']);

function indexesUsed(plan: PlanNode): string[] {
  return walk(plan)
    .filter((node) => INDEX_NODE_TYPES.has(node['Node Type']) && node['Index Name'])
    .map((node) => node['Index Name'] as string);
}

function summary(plan: PlanNode): string {
  return walk(plan)
    .map((node) => {
      const parts = [node['Node Type']];
      if (node['Index Name']) parts.push(`(${node['Index Name']})`);
      if (node['Index Cond']) parts.push(`[cond ${String(node['Index Cond'])}]`);
      if (node.Filter) parts.push(`[filter ${String(node.Filter)}]`);
      return parts.join(' ');
    })
    .join(' > ');
}

// ---------------------------------------------------------------- volumen

test('RNF-005-05: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{
    users: string;
    target: string;
    total: string;
    read: string;
    deliveries: string;
    pending: string;
  }>(
    `SELECT (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM notifications WHERE user_id = $1) AS target,
            (SELECT count(*) FROM notifications) AS total,
            (SELECT count(*) FROM notifications WHERE read_at IS NOT NULL) AS read,
            (SELECT count(*) FROM notification_deliveries) AS deliveries,
            (SELECT count(*) FROM notification_deliveries WHERE status = 'pending') AS pending`,
    [targetUserId],
  );
  const counts = rows[0];
  assert.ok(counts);
  assert.equal(Number(counts.users), USERS);
  assert.equal(Number(counts.target), TARGET_NOTIFICATIONS);
  assert.equal(Number(counts.total), TARGET_NOTIFICATIONS + OTHER_NOTIFICATIONS);
  assert.equal(Number(counts.read), (TARGET_NOTIFICATIONS + OTHER_NOTIFICATIONS) / 2);
  assert.equal(Number(counts.deliveries), DELIVERIES);
  assert.equal(Number(counts.pending), PENDING_DELIVERIES);
});

// ---------------------------------------------------------------- 1. lista paginada

test('RNF-005-05: la primera página de la lista usa notifications_user_idx y tarda < 300 ms', async (t) => {
  const plan = await explain(LIST_FIRST_PAGE_SQL, [targetUserId], false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
  assert.ok(indexesUsed(plan.Plan).includes('notifications_user_idx'), summary(plan.Plan));

  const analyzed = await explain(LIST_FIRST_PAGE_SQL, [targetUserId], true);
  t.diagnostic(`execution time: ${analyzed['Execution Time']} ms`);
  assert.ok((analyzed['Execution Time'] ?? Infinity) < LIST_BUDGET_MS);
});

test('RNF-005-05: una página intermedia con cursor usa notifications_user_idx y tarda < 300 ms', async (t) => {
  // Cursor a la mitad de los 1.000 avisos del usuario objetivo.
  const { rows } = await client.query<{ created_at: Date; id: string }>(
    `SELECT created_at, id FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC, id DESC OFFSET 499 LIMIT 1`,
    [targetUserId],
  );
  const cursor = rows[0];
  assert.ok(cursor);
  const params = [targetUserId, cursor.created_at, cursor.id];

  const page = await client.query(LIST_KEYSET_PAGE_SQL, params);
  assert.equal(page.rowCount, 20);

  const plan = await explain(LIST_KEYSET_PAGE_SQL, params, false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
  assert.ok(indexesUsed(plan.Plan).includes('notifications_user_idx'), summary(plan.Plan));

  const analyzed = await explain(LIST_KEYSET_PAGE_SQL, params, true);
  t.diagnostic(`execution time: ${analyzed['Execution Time']} ms`);
  assert.ok((analyzed['Execution Time'] ?? Infinity) < LIST_BUDGET_MS);
});

// ---------------------------------------------------------------- 2. contador de no leídas

test('RNF-005-05: el contador de no leídas usa notifications_unread_idx', async (t) => {
  const { rows } = await client.query<{ unread: string }>(UNREAD_COUNT_SQL, [targetUserId]);
  assert.equal(Number(rows[0]?.unread), TARGET_NOTIFICATIONS / 2);

  const plan = await explain(UNREAD_COUNT_SQL, [targetUserId], false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
  assert.ok(indexesUsed(plan.Plan).includes('notifications_unread_idx'), summary(plan.Plan));

  const analyzed = await explain(UNREAD_COUNT_SQL, [targetUserId], true);
  t.diagnostic(`execution time: ${analyzed['Execution Time']} ms`);
  assert.ok((analyzed['Execution Time'] ?? Infinity) < LIST_BUDGET_MS);
});

// ---------------------------------------------------------------- 3. entrega por lotes

test('RNF-005-05: el lote de envíos pendientes usa notification_deliveries_due_idx', async (t) => {
  // EXPLAIN sin ANALYZE no ejecuta la consulta, así que FOR UPDATE SKIP LOCKED no bloquea filas.
  const plan = await explain(DUE_DELIVERIES_SQL, [], false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
  assert.ok(indexesUsed(plan.Plan).includes('notification_deliveries_due_idx'), summary(plan.Plan));

  const { rowCount } = await client.query(DUE_DELIVERIES_SQL);
  assert.equal(rowCount, PENDING_DELIVERIES / 2);
});

// ---------------------------------------------------------------- 4. cancelar por entidad

test('RN-005-02: los avisos de una entidad se buscan con notifications_entity_idx', async (t) => {
  const { rows } = await client.query<{ entity_type: string; entity_id: string }>(
    'SELECT entity_type, entity_id FROM notifications WHERE user_id = $1 LIMIT 1',
    [targetUserId],
  );
  const entity = rows[0];
  assert.ok(entity);
  const params = [entity.entity_type, entity.entity_id];

  const plan = await explain(ENTITY_NOTIFICATIONS_SQL, params, false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
  assert.ok(indexesUsed(plan.Plan).includes('notifications_entity_idx'), summary(plan.Plan));
});

// ---------------------------------------------------------------- 5. limpieza a los 90 días

test('RF-005-21: notifications_purge_idx existe para la limpieza a los 90 días', async (t) => {
  const { rows } = await client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'notifications_purge_idx'`,
  );
  assert.match(rows[0]?.indexdef ?? '', /ON public\.notifications USING btree \(created_at\)/);

  // No se exige el índice en el plan: con fechas repartidas en 120 días, cerca de una cuarta parte
  // de las filas tiene más de 90 días y el planificador puede preferir un Seq Scan, que es lo
  // correcto para esa selectividad. El índice rinde cuando la limpieza corre a diario y solo
  // borra la franja de un día. Con el volumen de esta prueba el planificador eligió un Bitmap
  // Index Scan sobre notifications_purge_idx (revisión de T032, 2026-10-18), pero eso depende de
  // la selectividad y no es una regla. Se registra el plan obtenido.
  const plan = await explain(PURGE_SQL, [], false);
  t.diagnostic(`plan: ${summary(plan.Plan)}`);
});
