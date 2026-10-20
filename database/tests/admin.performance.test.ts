// Spec 009, T037 (CA-009-21; data-model.md, índices de users y admin_audit_log): planes de
// consulta de la búsqueda de usuarios y del log de auditoría con 10.000 usuarios de prueba. Las
// consultas son copia de backend/src/modules/admin/repositories/users-admin.repository.ts (list)
// y audit.repository.ts (list), y las estadísticas del tablero de stats.repository.ts (collect);
// la lista de columnas se resume. Todos los datos son ficticios.
//
// Volumen: 10.000 usuarios verificados (5 administradores) y 50.000 entradas de auditoría
// repartidas en el último año; para el tablero, 2.000 grupos con 72.000 cobros en 12 meses,
// reputación de todos los usuarios, 1.800 publicaciones, 6.000 solicitudes y 300 reclamos. La carga va con session_replication_role = replica (sin
// disparadores ni FK) para que tarde poco: las filas respetan los CHECK, y los disparadores ya
// los prueba admin.integrity.test.ts. Después se corre ANALYZE.
//
// CA-009-21 pide responder en menos de 2 s con 10.000 usuarios: cada consulta se ejecuta RUNS
// veces con EXPLAIN ANALYZE y se toma el percentil 95 del tiempo de ejecución en la base. Los
// planes se verifican sin forzar al planificador.
// Resultado: la búsqueda de usuarios por texto ('%término%') recorre users (un índice B-tree no
// sirve para LIKE con comodín inicial), pero con 10.000 usuarios tarda unos 40 ms: no hace falta
// un índice nuevo. El log sin filtro recorría toda la tabla, que crece sin límite: lo resuelve
// admin_audit_log_recent_idx (0095). Los filtros del log usan sus índices de 0092. Las
// estadísticas son conteos y sumas sobre tablas enteras o un período, y las ocho consultas juntas
// quedan muy por debajo de los 2 s.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const USERS = 10000;
const ADMINS = 5;
const AUDIT_ENTRIES = 50000;
const GROUPS = 2000;
const MONTHS = 12;
const RUNS = 10;
// CA-009-21: menos de 2 s.
const BUDGET_MS = 2000;
// Página de 20 más una fila para saber si hay otra.
const LIMIT = 21;

// ---------------------------------------------------------------- consultas del repositorio

const USER_COLUMNS = `id, full_name, email, role, status, created_at, last_login_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_us`;

// UsersAdminRepository.list() sin filtros, con texto, con estado y rol, y con cursor.
const USERS_ALL_SQL = `
  SELECT ${USER_COLUMNS} FROM users WHERE verified_at IS NOT NULL
   ORDER BY created_at DESC, id DESC LIMIT $1`;

const USERS_SEARCH_SQL = `
  SELECT ${USER_COLUMNS} FROM users
   WHERE verified_at IS NOT NULL
     AND (immutable_unaccent(lower(full_name)) LIKE '%' || immutable_unaccent(lower($1)) || '%' ESCAPE '\\'
          OR email ILIKE '%' || $1 || '%' ESCAPE '\\')
   ORDER BY created_at DESC, id DESC LIMIT $2`;

const USERS_STATUS_ROLE_SQL = `
  SELECT ${USER_COLUMNS} FROM users
   WHERE verified_at IS NOT NULL AND status = $1 AND role = $2
   ORDER BY created_at DESC, id DESC LIMIT $3`;

const USERS_CURSOR_SQL = `
  SELECT ${USER_COLUMNS} FROM users
   WHERE verified_at IS NOT NULL AND (created_at, id) < ($1::timestamptz, $2::uuid)
   ORDER BY created_at DESC, id DESC LIMIT $3`;

const AUDIT_COLUMNS = `id, admin_id, action, target_type, target_id, reason, metadata, occurred_at,
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_us`;

// AuditRepository.list() sin filtros y con cada filtro.
const auditSql = (where: string, limitParam: number): string => `
  SELECT ${AUDIT_COLUMNS} FROM admin_audit_log ${where}
   ORDER BY occurred_at DESC, id DESC LIMIT $${limitParam}`;

interface StatsWindow {
  period: string;
  monthStart: Date;
  since30d: Date;
}

// StatsRepository.collect(): las ocho consultas del tablero (US7), con sus parámetros.
const STATS_QUERIES: [string, (w: StatsWindow) => unknown[], string][] = [
  [
    'usuarios',
    (w) => [w.monthStart, w.since30d],
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE created_at >= $1)::text AS new_month,
            count(*) FILTER (WHERE last_login_at >= $2)::text AS active
       FROM users`,
  ],
  ['grupos', () => [], 'SELECT status, count(*)::text AS total FROM groups GROUP BY status'],
  [
    'cobros del período',
    (w) => [w.period],
    `SELECT status, count(*)::text AS total, COALESCE(sum(amount_cents), 0)::text AS cents
       FROM charges WHERE period = $1 GROUP BY status`,
  ],
  [
    'puntualidad',
    () => [],
    `SELECT sum(punctual_count)::text AS punctual, sum(considered_count)::text AS considered
       FROM user_reputation`,
  ],
  [
    'servicios principales',
    () => [],
    `SELECT service_name_snapshot AS name, count(*)::text AS total
       FROM groups WHERE status = 'activo'
      GROUP BY service_name_snapshot ORDER BY count(*) DESC, service_name_snapshot LIMIT 5`,
  ],
  [
    'publicaciones',
    () => [],
    "SELECT count(*)::text AS total FROM listings WHERE status = 'activa'",
  ],
  [
    'solicitudes del mes',
    (w) => [w.monthStart],
    'SELECT count(*)::text AS total FROM join_requests WHERE created_at >= $1',
  ],
  [
    'reclamos abiertos',
    () => [],
    "SELECT count(*)::text AS total FROM join_disputes WHERE status = 'abierto'",
  ],
];

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version, verified_at, role, status, last_login_at, created_at)
  SELECT (ARRAY['María', 'José', 'Lucía', 'Andrés', 'Sofía'])[1 + g % 5] || ' Pérez ' || g,
         'admin' || g || '@example.com', md5('email:admin' || g), $1, '\\x01'::bytea,
         md5('ci:' || (7000000 + g)), '+5917' || lpad(g::text, 7, '0'), 730000000 + g, now(),
         '2026-10-18', now() - make_interval(hours => g),
         CASE WHEN g <= ${ADMINS} THEN 'admin' ELSE 'usuario' END,
         CASE WHEN g % 50 = 0 THEN 'suspendido' WHEN g % 97 = 0 THEN 'baneado' ELSE 'activo' END,
         now() - make_interval(hours => g % 300), now() - make_interval(hours => g)
    FROM generate_series(1, ${USERS}) AS g;

  CREATE TEMP TABLE adm AS
    SELECT id, row_number() OVER (ORDER BY email) AS n FROM users WHERE role = 'admin';

  CREATE TEMP TABLE usr AS
    SELECT id, row_number() OVER (ORDER BY id) AS n FROM users WHERE role = 'usuario';

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, occurred_at)
  SELECT adm.id, a.action, 'user', usr.id, 'Motivo de prueba número ' || e,
         now() - make_interval(mins => e * 10)
    FROM generate_series(1, ${AUDIT_ENTRIES}) AS e
    JOIN adm ON adm.n = 1 + e % ${ADMINS}
    JOIN usr ON usr.n = 1 + (e * 7) % (${USERS} - ${ADMINS})
    CROSS JOIN LATERAL (
      SELECT (ARRAY['usuario_suspender', 'usuario_reactivar', 'usuario_banear',
                    'titular_habilitar', 'rol_promover'])[1 + (e / ${ADMINS}) % 5] AS action
    ) a;

  -- Tablero: el grupo gn es del usuario común n = gn; uno de cada diez está cerrado.
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code, status, closed_at)
  SELECT usr.id, 'Grupo ' || gn,
         (ARRAY['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Max', 'Duolingo',
                'Google One'])[1 + gn % 7],
         6000, 'BS', 5, 5,
         translate(lpad(to_hex(gn * 7919), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS'),
         CASE WHEN gn % 10 = 0 THEN 'cerrado' ELSE 'activo' END,
         CASE WHEN gn % 10 = 0 THEN now() - interval '10 days' END
    FROM generate_series(1, ${GROUPS}) AS gn
    JOIN usr ON usr.n = gn;

  CREATE TEMP TABLE gr AS
    SELECT id, owner_id, row_number() OVER (ORDER BY id) AS gn FROM groups;

  -- Tres cobros por grupo y mes: los del mes en curso abiertos, los anteriores pagados y uno de
  -- cada 25 cancelado.
  INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                       price_cents, currency, total_bs_cents, member_count, issued_at, due_at,
                       paid_at, settled_by, settlement, cancelled_at, cancelled_by, cancel_reason)
  SELECT gr.id, usr.id, gen_random_uuid(), to_char(c.cut, 'YYYY-MM'), 'ciclo', st.status, 1500,
         6000, 'BS', 6000, 4, c.cut, c.cut + interval '4 days',
         CASE WHEN st.status = 'pagado' THEN c.cut + interval '1 day' END,
         CASE WHEN st.status = 'pagado' THEN gr.owner_id END,
         CASE WHEN st.status = 'pagado' THEN 'manual' END,
         CASE WHEN st.status = 'cancelado' THEN c.cut + interval '2 days' END,
         CASE WHEN st.status = 'cancelado' THEN gr.owner_id END,
         CASE WHEN st.status = 'cancelado' THEN 'Cobro duplicado' END
    FROM gr
    CROSS JOIN generate_series(1, 3) AS k
    JOIN usr ON usr.n = ${GROUPS} + 1 + ((gr.gn * 3 + k) % (${USERS} - ${ADMINS} - ${GROUPS}))
    CROSS JOIN LATERAL (
      SELECT (date_trunc('month', now()) - make_interval(months => m))::date + 4 AS cut, m
        FROM generate_series(0, ${MONTHS - 1}) AS m
    ) c
    CROSS JOIN LATERAL (
      SELECT CASE WHEN c.m = 0 THEN (ARRAY['pendiente', 'en_revision', 'atrasado'])[1 + k % 3]
                  WHEN (gr.gn + k + c.m) % 25 = 0 THEN 'cancelado'
                  ELSE 'pagado' END AS status
    ) st;

  INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                               displayed_half_stars, level, current_streak, rules_version,
                               computed_at)
  SELECT id, 12, 10, 2, 8, 'Bueno', 3, 1, now() FROM users;

  -- Una publicación por grupo activo: dos de cada tres 'activa', el resto 'expirada'.
  INSERT INTO listings (group_id, slots_offered, status, published_at, expires_at)
  SELECT id, 1, CASE WHEN gn % 3 = 0 THEN 'expirada' ELSE 'activa' END, p.at,
         p.at + interval '30 days'
    FROM gr
    CROSS JOIN LATERAL (
      SELECT now() - CASE WHEN gn % 3 = 0 THEN interval '40 days' ELSE interval '1 day' END AS at
    ) p
   WHERE gn % 10 <> 0;

  INSERT INTO join_requests (group_id, applicant_id, status, opened_at, open_deadline_at,
                             final_at, final_reason, created_at)
  SELECT gr.id, usr.id, 'expirada', o.at, o.at + interval '24 hours',
         o.at + interval '24 hours', 'plazo_solicitud', o.at
    FROM gr
    CROSS JOIN generate_series(1, 3) AS k
    JOIN usr ON usr.n = ${GROUPS} + 1 + ((gr.gn * 5 + k) % (${USERS} - ${ADMINS} - ${GROUPS}))
    CROSS JOIN LATERAL (SELECT now() - make_interval(days => ((gr.gn + k) % 90)::int) AS at) o;

  -- 300 reclamos, uno de cada tres resuelto.
  INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at,
                             status, resolution, resolution_reason, resolved_by, resolved_at)
  SELECT d.id, 'pago_sin_ingreso', d.applicant_id, d.owner_id,
         'Pagué y no me aceptaron en el grupo', d.final_at,
         CASE WHEN d.r % 3 = 0 THEN 'resuelto' ELSE 'abierto' END,
         CASE WHEN d.r % 3 = 0 THEN 'sin_falta' END,
         CASE WHEN d.r % 3 = 0 THEN 'No hubo falta del titular' END,
         CASE WHEN d.r % 3 = 0 THEN (SELECT id FROM adm WHERE n = 1) END,
         CASE WHEN d.r % 3 = 0 THEN d.final_at + interval '1 day' END
    FROM (SELECT jr.id, jr.applicant_id, g.owner_id, jr.final_at,
                 row_number() OVER (ORDER BY jr.id) AS r
            FROM join_requests jr JOIN groups g ON g.id = jr.group_id
           ORDER BY jr.id LIMIT 300) d`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let adminId: string;
let targetUserId: string;
let middleUser: { created_at: Date; id: string };
let middleEntry: { occurred_at: Date; id: string };

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();

  await client.query('BEGIN');
  await client.query("SET LOCAL session_replication_role = 'replica'");
  for (const statement of LOAD_SQL.split(/;\s*\n/).filter((s) => s.trim())) {
    await client.query(statement, statement.includes('$1') ? [FAKE_HASH] : []);
  }
  await client.query('COMMIT');
  await client.query(
    'ANALYZE users, admin_audit_log, groups, charges, user_reputation, listings, join_requests, join_disputes',
  );

  const { rows } = await client.query<{ admin: string; target: string }>(
    `SELECT (SELECT id FROM users WHERE email = 'admin1@example.com') AS admin,
            (SELECT target_id FROM admin_audit_log ORDER BY occurred_at DESC LIMIT 1) AS target`,
  );
  assert.ok(rows[0]);
  adminId = rows[0].admin;
  targetUserId = rows[0].target;
  const { rows: users } = await client.query<{ created_at: Date; id: string }>(
    `SELECT created_at, id FROM users ORDER BY created_at DESC, id DESC OFFSET ${USERS / 2} LIMIT 1`,
  );
  const { rows: entries } = await client.query<{ occurred_at: Date; id: string }>(
    `SELECT occurred_at, id FROM admin_audit_log ORDER BY occurred_at DESC, id DESC
     OFFSET ${AUDIT_ENTRIES / 2} LIMIT 1`,
  );
  assert.ok(users[0] && entries[0]);
  middleUser = users[0];
  middleEntry = entries[0];
});

after(async () => {
  await client?.end();
  await db?.drop();
});

// ---------------------------------------------------------------- lectura de planes

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainResult {
  Plan: PlanNode;
  'Execution Time': number;
}

async function explain(sql: string, params: unknown[]): Promise<ExplainResult> {
  const { rows } = await client.query<{ 'QUERY PLAN': unknown }>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    params,
  );
  const raw = rows[0]?.['QUERY PLAN'];
  const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ExplainResult[];
  assert.ok(parsed[0]);
  return parsed[0];
}

/** Ejecuta la consulta RUNS veces y devuelve el último plan y el percentil 95 del tiempo. */
async function measure(sql: string, params: unknown[]): Promise<{ plan: PlanNode; p95: number }> {
  const times: number[] = [];
  let last: ExplainResult | undefined;
  for (let i = 0; i < RUNS; i += 1) {
    last = await explain(sql, params);
    times.push(last['Execution Time']);
  }
  assert.ok(last);
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  return { plan: last.Plan, p95 };
}

function walk(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(walk)];
}

function summary(plan: PlanNode): string {
  return walk(plan)
    .map((node) => node['Node Type'] + (node['Index Name'] ? ` (${node['Index Name']})` : ''))
    .join(' > ');
}

function indexesUsed(plan: PlanNode): string[] {
  return walk(plan)
    .filter((node) => node['Index Name'])
    .map((node) => node['Index Name'] as string);
}

// ---------------------------------------------------------------- pruebas

test('CA-009-21: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{ users: string; admins: string; entries: string }>(
    `SELECT (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM users WHERE role = 'admin') AS admins,
            (SELECT count(*) FROM admin_audit_log) AS entries`,
  );
  assert.equal(Number(rows[0]?.users), USERS);
  assert.equal(Number(rows[0]?.admins), ADMINS);
  assert.equal(Number(rows[0]?.entries), AUDIT_ENTRIES);
});

test('CA-009-21: la lista y la búsqueda de usuarios responden en menos de 2 s', async (t) => {
  const cases: [string, unknown[]][] = [
    [USERS_ALL_SQL, [LIMIT]],
    [USERS_SEARCH_SQL, ['perez 77', LIMIT]],
    [USERS_SEARCH_SQL, ['admin4321@', LIMIT]],
    [USERS_SEARCH_SQL, ['sin coincidencias', LIMIT]],
    [USERS_STATUS_ROLE_SQL, ['suspendido', 'usuario', LIMIT]],
    [USERS_CURSOR_SQL, [middleUser.created_at, middleUser.id, LIMIT]],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('CA-009-21: el log de auditoría filtrado usa los índices de 0092', async (t) => {
  const cases: [string, unknown[], string][] = [
    [auditSql('WHERE admin_id = $1', 2), [adminId, LIMIT], 'admin_audit_log_admin_idx'],
    [auditSql('WHERE action = $1', 2), ['usuario_banear', LIMIT], 'admin_audit_log_action_idx'],
    [
      auditSql('WHERE target_type = $1 AND target_id = $2', 3),
      ['user', targetUserId, LIMIT],
      'admin_audit_log_target_idx',
    ],
  ];
  for (const [sql, params, index] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(indexesUsed(plan).includes(index), summary(plan));
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('CA-009-21: el log de auditoría sin filtro, por fechas y con cursor usa admin_audit_log_recent_idx', async (t) => {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const cases: [string, unknown[]][] = [
    [auditSql('', 1), [LIMIT]],
    [auditSql('WHERE occurred_at >= $1 AND occurred_at <= $2', 3), [monthAgo, now, LIMIT]],
    [
      auditSql('WHERE (occurred_at, id) < ($1::timestamptz, $2::uuid)', 3),
      [middleEntry.occurred_at, middleEntry.id, LIMIT],
    ],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(indexesUsed(plan).includes('admin_audit_log_recent_idx'), summary(plan));
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('CA-009-21: las estadísticas del tablero responden en menos de 2 s', async (t) => {
  const now = new Date();
  const window: StatsWindow = {
    period: now.toISOString().slice(0, 7),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    since30d: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
  };
  // collect() lanza las ocho a la vez; la suma de sus p95 es una cota superior del tablero.
  let total = 0;
  for (const [name, params, sql] of STATS_QUERIES) {
    const { plan, p95 } = await measure(sql, params(window));
    t.diagnostic(`${name}: ${summary(plan)}; p95 ${p95} ms`);
    total += p95;
  }
  t.diagnostic(`tablero: ${total} ms`);
  assert.ok(total < BUDGET_MS, `${total} ms`);
});
