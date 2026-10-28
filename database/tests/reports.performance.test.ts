// Spec 006, T029 (RNF-006-01; data-model.md §2 y §3): planes de consulta de las vistas
// v_user_cost_lines y v_group_collection y del resto de las lecturas del panel y los reportes,
// con el volumen de la spec: una persona con 20 suscripciones y 12 meses. Las consultas son copia
// de backend/src/modules/reports/repositories/reports.repository.ts (spendLines, availableMonths,
// debtTotals, owedByGroup, collectionForOwner, lateMembers, monthlySpend, savingsInputs,
// firstPeriod, listCharges, memberCharges, calendarGroups, calendarCharges, ownerCycles,
// countHistory e historyPage). Todos los datos son ficticios.
//
// Volumen: 400 usuarios y 200 grupos de 4 personas (titular y tres miembros) con 12 ciclos
// regulares cada uno: 7.200 cobros. La persona objetivo es titular de 5 grupos y miembro de otros
// 15 (20 suscripciones). La carga va con session_replication_role = replica (sin disparadores ni
// FK) para que tarde poco: las filas respetan los CHECK y son coherentes entre sí, y los
// disparadores ya los prueba reports.integrity.test.ts. Después se corre ANALYZE.
//
// p95 < 1 s (RNF-006-01): cada consulta se ejecuta RUNS veces con EXPLAIN ANALYZE y se toma el
// percentil 95 del tiempo de ejecución en la base, sin red ni backend. Los planes se verifican sin
// forzar al planificador. Resultado: con 0101 bastan los índices existentes (p95 de unos 5 ms).
//
// Rol de lectura (0102, opcional): no hace falta. El backend lee las vistas con el mismo rol
// dueño de las tablas que ya usa para el resto de las consultas.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const USERS = 400;
const GROUPS = 200;
const MONTHS = 12;
const RUNS = 20;
// RNF-006-01: p95 < 1 s.
const BUDGET_MS = 1000;

// ---------------------------------------------------------------- consultas del repositorio

const SPEND_LINES_SQL = `
  SELECT v.group_id, g.name, g.service_name_snapshot, g.logo_url_snapshot, v.role,
         sum(v.cost_cents)::bigint AS cost,
         sum(v.paid_cents)::bigint AS paid,
         max(v.individual_price_bs_cents)::bigint AS individual
    FROM v_user_cost_lines v
    JOIN groups g ON g.id = v.group_id
   WHERE v.user_id = $1 AND v.period = $2 AND ($3::uuid IS NULL OR v.group_id = $3)
   GROUP BY v.group_id, g.name, g.service_name_snapshot, g.logo_url_snapshot, v.role
   ORDER BY g.service_name_snapshot, g.name, v.group_id`;

const AVAILABLE_MONTHS_SQL = `
  SELECT DISTINCT period FROM v_user_cost_lines WHERE user_id = $1 ORDER BY period DESC`;

const DEBT_TOTALS_SQL = `
  SELECT (status = 'en_revision') AS in_review,
         sum(amount_cents)::bigint AS cents, count(*)::integer AS total
    FROM charges
   WHERE user_id = $1 AND status IN ('pendiente', 'atrasado', 'en_revision')
   GROUP BY (status = 'en_revision')`;

const OWED_BY_GROUP_SQL = `
  SELECT c.group_id, g.name, g.service_name_snapshot,
         sum(c.amount_cents)::bigint AS cents, count(*)::integer AS total
    FROM charges c
    JOIN groups g ON g.id = c.group_id
   WHERE g.owner_id = $1 AND c.status IN ('pendiente', 'atrasado', 'en_revision')
   GROUP BY c.group_id, g.name, g.service_name_snapshot
   ORDER BY g.service_name_snapshot, g.name, c.group_id`;

const COLLECTION_SQL = `
  SELECT gc.group_id, g.name, g.service_name_snapshot, gc.period, gc.expected_cents,
         gc.collected_cents, gc.in_review_cents, gc.pending_cents
    FROM v_group_collection gc
    JOIN groups g ON g.id = gc.group_id
   WHERE g.owner_id = $1 AND gc.period = $2 AND ($3::uuid IS NULL OR gc.group_id = $3)
   ORDER BY g.service_name_snapshot, g.name, gc.group_id`;

const LATE_MEMBERS_SQL = `
  SELECT c.group_id, c.user_id, u.full_name, c.id, c.amount_cents, c.due_at
    FROM charges c
    JOIN users u ON u.id = c.user_id
   WHERE c.group_id = ANY($1::uuid[]) AND c.period = $2 AND c.status = 'atrasado'
   ORDER BY c.due_at, c.id`;

const MONTHLY_SPEND_SQL = `
  SELECT period, sum(cost_cents)::bigint AS total,
         COALESCE(sum(paid_cents), 0)::bigint AS paid
    FROM v_user_cost_lines
   WHERE user_id = $1 AND period BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR group_id = $4)
   GROUP BY period ORDER BY period`;

const SAVINGS_SQL = `
  SELECT period, max(individual_price_bs_cents)::bigint AS individual,
         sum(cost_cents)::bigint AS share
    FROM v_user_cost_lines
   WHERE user_id = $1 AND period BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR group_id = $4)
   GROUP BY period, group_id ORDER BY period, group_id`;

const FIRST_PERIOD_SQL = `
  SELECT min(period) AS first FROM v_user_cost_lines
   WHERE user_id = $1 AND ($2::uuid IS NULL OR group_id = $2)`;

const listChargesSql = (ownerScope: boolean): string => `
  SELECT c.id, c.group_id, g.name, g.service_name_snapshot, c.period, u.full_name,
         c.amount_cents, c.status, c.due_at
    FROM charges c
    JOIN groups g ON g.id = c.group_id
    JOIN users u ON u.id = c.user_id
   WHERE ${ownerScope ? 'g.owner_id' : 'c.user_id'} = $1
     AND c.status = ANY($2::text[])
     AND ($3::uuid IS NULL OR c.group_id = $3)
     AND ($4::timestamptz IS NULL OR (c.due_at, c.id) > ($4::timestamptz, $5::uuid))
   ORDER BY c.due_at, c.id
   LIMIT $6`;

const MEMBER_CHARGES_SQL = `
  SELECT c.user_id, u.full_name, c.id, c.amount_cents, c.status
    FROM charges c JOIN users u ON u.id = c.user_id
   WHERE c.group_id = $1 AND c.period = $2 AND c.status <> 'cancelado'
   ORDER BY u.full_name, c.id`;

const CALENDAR_GROUPS_SQL = `
  SELECT g.id, g.name, g.service_name_snapshot, g.owner_id, g.billing_day, g.status,
         g.total_bs_cents,
         (SELECT count(*) FROM group_members m
           WHERE m.group_id = g.id AND m.left_at IS NULL) AS members
    FROM groups g
   WHERE EXISTS (SELECT 1 FROM group_members m
                  WHERE m.group_id = g.id AND m.user_id = $1 AND m.left_at IS NULL)
      OR EXISTS (SELECT 1 FROM charges c WHERE c.group_id = g.id AND c.user_id = $1)
      OR EXISTS (SELECT 1 FROM billing_cycles bc WHERE bc.group_id = g.id AND bc.owner_id = $1)
   ORDER BY g.service_name_snapshot, g.name, g.id`;

const CALENDAR_CHARGES_SQL = `
  SELECT id, group_id, period, amount_cents, status, due_at
    FROM charges
   WHERE user_id = $1 AND status <> 'cancelado'
     AND (period = ANY($2::text[]) OR status IN ('pendiente', 'atrasado'))
   ORDER BY due_at, id`;

const OWNER_CYCLES_SQL = `
  SELECT group_id, period, owner_share_cents, due_date::text AS due_date
    FROM billing_cycles
   WHERE owner_id = $1 AND period = ANY($2::text[])`;

// historyWhere() del historial propio sin filtros: solo c.user_id = $1.
const COUNT_HISTORY_SQL = `SELECT count(*)::text AS total FROM charges c WHERE c.user_id = $1`;

const HISTORY_PAGE_SQL = `
  SELECT c.id, c.period, c.group_id, g.name, g.service_name_snapshot, u.full_name,
         c.amount_cents, c.status, c.origin, c.due_at, c.paid_at
    FROM charges c
    JOIN groups g ON g.id = c.group_id
    JOIN users u ON u.id = c.user_id
   WHERE c.user_id = $1
   ORDER BY c.period DESC, c.id DESC
   LIMIT $2`;

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version)
  SELECT 'Persona de Volumen ' || g, 'panel' || g || '@example.com',
         md5('email:panel' || g), $1, '\\x01'::bytea, md5('ci:' || (6000000 + g)),
         '+5916' || lpad(g::text, 7, '0'), 720000000 + g, now(), '2026-10-18'
    FROM generate_series(1, ${USERS}) AS g;

  CREATE TEMP TABLE u AS
    SELECT id, substring(email FROM 'panel([0-9]+)@')::int AS n FROM users;

  -- Grupo gn: titular = usuario 1 (el objetivo) en los 5 primeros, usuario gn + 1 en el resto.
  -- La mitad tiene precio individual de referencia en Bs (para el ahorro).
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code, individual_price_cents_snapshot,
                      individual_price_currency_snapshot)
  SELECT u.id, 'Grupo ' || gn, 'Servicio ' || (gn % 7), 6000, 'BS', 5, 5,
         translate(lpad(to_hex(gn * 7919), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS'),
         CASE WHEN gn % 2 = 0 THEN 4000 END, CASE WHEN gn % 2 = 0 THEN 'BS' END
    FROM generate_series(1, ${GROUPS}) AS gn
    JOIN u ON u.n = CASE WHEN gn <= 5 THEN 1 ELSE gn + 1 END;

  CREATE TEMP TABLE gr AS
    SELECT id, owner_id, row_number() OVER (ORDER BY id) AS gn FROM groups;

  -- Miembros: tres por grupo entre los usuarios 202 a 400, y el objetivo como primer miembro en
  -- 15 grupos que no son suyos.
  CREATE TEMP TABLE mem AS
    SELECT gr.id AS group_id, gr.owner_id AS user_id, 'titular' AS role FROM gr
    UNION ALL
    SELECT gr.id, u.id, 'miembro'
      FROM gr
      CROSS JOIN generate_series(1, 3) AS k
      JOIN u ON u.n = CASE
                        WHEN k = 1 AND gr.id IN (SELECT t.id FROM gr t
                                                  JOIN u o ON o.id = t.owner_id
                                                 WHERE o.n <> 1 ORDER BY t.gn LIMIT 15)
                          THEN 1
                        ELSE 202 + ((gr.gn * 3 + k) % (${USERS} - 202))
                      END;

  INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
  SELECT group_id, user_id, role, CASE role WHEN 'titular' THEN 'creacion' ELSE 'solicitud' END,
         CASE role WHEN 'titular' THEN NULL ELSE gen_random_uuid() END
    FROM mem;

  INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                              issued_at, price_cents, currency, total_bs_cents, member_count,
                              base_share_cents, owner_share_cents, remainder_cents, finalized_at)
  SELECT gr.id, gr.owner_id, to_char(c.cut, 'YYYY-MM'), 'regular', c.cut, c.cut + 3,
         c.cut + interval '12 hours', 6000, 'BS', 6000, 4, 1500, 1500, 0,
         c.cut + interval '12 hours'
    FROM gr
    CROSS JOIN LATERAL (
      SELECT (date_trunc('month', now()) - make_interval(months => m))::date + 4 AS cut
        FROM generate_series(0, ${MONTHS - 1}) AS m
    ) c;

  -- Estado: los del último mes 'pendiente' o 'en_revision', los anteriores 'pagado', y uno de
  -- cada diez 'atrasado'.
  INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                       price_cents, currency, total_bs_cents, member_count, issued_at, due_at,
                       paid_at, settled_by, settlement, first_submitted_at)
  SELECT bc.group_id, m.user_id, bc.id, bc.period, 'ciclo', s.status, 1500, 6000, 'BS', 6000, 4,
         bc.issued_at, bc.cut_date + interval '4 days 4 hours',
         CASE WHEN s.status = 'pagado' THEN bc.issued_at + interval '1 day' END,
         CASE WHEN s.status = 'pagado' THEN bc.owner_id END,
         CASE WHEN s.status = 'pagado' THEN 'manual' END,
         -- en_revision exige el comprobante subido (0045, BUG-015).
         CASE WHEN s.status = 'en_revision' THEN bc.issued_at + interval '1 day' END
    FROM billing_cycles bc
    JOIN group_members m ON m.group_id = bc.group_id AND m.role = 'miembro'
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN bc.period = to_char(now(), 'YYYY-MM')
                 THEN CASE WHEN abs(hashtext(m.user_id::text)) % 3 = 0 THEN 'en_revision'
                           ELSE 'pendiente' END
               WHEN abs(hashtext(m.user_id::text || bc.period)) % 10 = 0 THEN 'atrasado'
               ELSE 'pagado'
             END AS status
    ) s`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let userId: string;
let ownedGroupIds: string[];
const period = new Date().toISOString().slice(0, 7);
let periods: string[];

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
  await client.query('ANALYZE users, groups, group_members, billing_cycles, charges');

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'panel1@example.com'",
  );
  assert.ok(rows[0]);
  userId = rows[0].id;
  const { rows: owned } = await client.query<{ id: string }>(
    'SELECT id FROM groups WHERE owner_id = $1 ORDER BY id',
    [userId],
  );
  ownedGroupIds = owned.map((r) => r.id);
  const { rows: months } = await client.query<{ period: string }>(
    'SELECT DISTINCT period FROM billing_cycles ORDER BY period',
  );
  periods = months.map((r) => r.period);
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

function seqScansOn(plan: PlanNode, relation: string): number {
  return walk(plan).filter(
    (node) => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === relation,
  ).length;
}

// ---------------------------------------------------------------- pruebas

test('RNF-006-01: el volumen de prueba quedó cargado (20 suscripciones × 12 meses)', async () => {
  const { rows } = await client.query<{ total: string; subs: string; lines: string }>(
    `SELECT (SELECT count(*) FROM charges) AS total,
            (SELECT count(DISTINCT group_id) FROM group_members WHERE user_id = $1) AS subs,
            (SELECT count(*) FROM v_user_cost_lines WHERE user_id = $1) AS lines`,
    [userId],
  );
  assert.equal(Number(rows[0]?.total), GROUPS * 3 * MONTHS);
  assert.equal(Number(rows[0]?.subs), 20);
  assert.equal(Number(rows[0]?.lines), 20 * MONTHS);
  assert.equal(ownedGroupIds.length, 5);
  assert.equal(periods.length, MONTHS);
});

test('RNF-006-01: v_user_cost_lines por persona lee charges y billing_cycles por índices de la persona, p95 < 1 s', async (t) => {
  const from = periods[0];
  const cases: [string, unknown[]][] = [
    [SPEND_LINES_SQL, [userId, period, null]],
    [MONTHLY_SPEND_SQL, [userId, from, period, null]],
    [SAVINGS_SQL, [userId, from, period, null]],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.equal(seqScansOn(plan, 'charges'), 0, summary(plan));
    assert.ok(
      indexesUsed(plan).some((name) =>
        ['charges_user_period_idx', 'charges_user_status_idx'].includes(name),
      ),
      summary(plan),
    );
    assert.ok(indexesUsed(plan).includes('billing_cycles_owner_period_idx'), summary(plan));
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('RNF-006-01: meses disponibles y primer período leen la vista por persona sin recorrer charges, p95 < 1 s', async (t) => {
  const cases: [string, unknown[]][] = [
    [AVAILABLE_MONTHS_SQL, [userId]],
    [FIRST_PERIOD_SQL, [userId, null]],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.equal(seqScansOn(plan, 'charges'), 0, summary(plan));
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('RNF-006-01: v_group_collection del titular, «Me deben» y atrasados, p95 < 1 s', async (t) => {
  const cases: [string, unknown[]][] = [
    [COLLECTION_SQL, [userId, period, null]],
    [OWED_BY_GROUP_SQL, [userId]],
    [LATE_MEMBERS_SQL, [ownedGroupIds, periods[periods.length - 2]]],
    [MEMBER_CHARGES_SQL, [ownedGroupIds[0], period]],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});

test('RNF-006-01: deudas, páginas del panel, calendario e historial, p95 < 1 s', async (t) => {
  const cases: [string, unknown[]][] = [
    [DEBT_TOTALS_SQL, [userId]],
    [listChargesSql(false), [userId, ['pendiente', 'atrasado'], null, null, null, 21]],
    [
      listChargesSql(true),
      [userId, ['pendiente', 'atrasado', 'en_revision'], null, null, null, 21],
    ],
    [CALENDAR_GROUPS_SQL, [userId]],
    [CALENDAR_CHARGES_SQL, [userId, periods.slice(-2)]],
    [OWNER_CYCLES_SQL, [userId, periods.slice(-2)]],
    [COUNT_HISTORY_SQL, [userId]],
    [HISTORY_PAGE_SQL, [userId, 51]],
  ];
  for (const [sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`plan: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(p95 < BUDGET_MS, `p95 ${p95} ms`);
  }
});
