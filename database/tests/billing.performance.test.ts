// Spec 002, T045 (RNF-002-05; data-model.md, índices de charges): planes de consulta de «Mis
// cobros», el resumen del mes del titular y el barrido de atrasos, con datos de volumen. Las
// consultas son copia de backend/src/modules/billing/repositories/charges.repository.ts (listMine,
// listByGroupPeriod, listOverdueForUpdate). Todos los datos son ficticios.
//
// Volumen: 300 usuarios y 100 grupos de 4 personas (titular y tres miembros) con 12 ciclos
// regulares cada uno: 3.600 cobros, de los que el usuario objetivo tiene 240 (está en 20 grupos).
// La carga va con session_replication_role = replica (sin disparadores ni FK) para que tarde poco:
// las filas respetan los CHECK y son coherentes entre sí, y los disparadores ya los prueba
// billing.integrity.test.ts. Después se corre ANALYZE. Los planes se verifican sin forzar al
// planificador; la spec 002 no fija un tiempo, así que el tiempo de ejecución solo se informa.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const USERS = 300;
const GROUPS = 100;
const MONTHS = 12;

// ---------------------------------------------------------------- consultas del repositorio

// «Mis cobros», primera página sin filtros (listMine, RF-002-15).
const MY_CHARGES_SQL = `
  SELECT * FROM charges
   WHERE user_id = $1
     AND (cardinality($2::text[]) = 0 OR status = ANY($2::text[]))
     AND ($3::text IS NULL OR period = $3)
     AND ($4::uuid IS NULL OR group_id = $4)
     AND (status IN ('atrasado', 'en_revision')
          OR EXISTS (SELECT 1 FROM group_members gm
                      WHERE gm.group_id = charges.group_id AND gm.user_id = charges.user_id
                        AND gm.left_at IS NULL))
     AND ($5::timestamptz IS NULL OR (due_at, id) < ($5::timestamptz, $6::uuid))
   ORDER BY due_at DESC, id DESC
   LIMIT $7`;

// Resumen del mes del titular (listByGroupPeriod, RF-002-16).
const GROUP_PERIOD_SQL = `
  SELECT * FROM charges WHERE group_id = $1 AND period = $2
   ORDER BY issued_at, id`;

// Barrido de atrasos (listOverdueForUpdate).
const OVERDUE_SQL = `
  SELECT * FROM charges
   WHERE status = 'pendiente' AND due_at <= $1 AND ($2::uuid IS NULL OR group_id = $2)
   ORDER BY due_at, id
   FOR UPDATE SKIP LOCKED`;

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version)
  SELECT 'Persona de Volumen ' || g, 'cobros' || g || '@example.com',
         md5('email:cobros' || g), $1, '\\x01'::bytea, md5('ci:' || (4000000 + g)),
         '+5916' || lpad(g::text, 7, '0'), 700000000 + g, now(), '2026-10-18'
    FROM generate_series(1, ${USERS}) AS g;

  CREATE TEMP TABLE u AS
    SELECT id, substring(email FROM 'cobros([0-9]+)@')::int AS n FROM users;

  -- Grupo g: titular = usuario g; miembros = usuario 1 (el objetivo) en los 20 primeros grupos, y
  -- otros dos o tres usuarios en el resto.
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code)
  SELECT u.id, 'Grupo ' || g, 'Servicio', 6000, 'BS', 5, 5,
         translate(lpad(to_hex(g * 7919), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS')
    FROM generate_series(2, ${GROUPS + 1}) AS g JOIN u ON u.n = g;

  CREATE TEMP TABLE gm AS
    SELECT gr.id AS group_id, gr.owner_id AS user_id, 'titular' AS role,
           row_number() OVER (ORDER BY gr.id) AS gn
      FROM groups gr;
  INSERT INTO gm
    SELECT t.group_id, u.id, 'miembro', t.gn
      FROM gm t
      CROSS JOIN generate_series(1, 3) AS k
      JOIN u ON u.n = CASE WHEN k = 1 AND t.gn <= 20 THEN 1
                           ELSE 102 + ((t.gn * 3 + k) % (${USERS} - 102)) END
     WHERE t.role = 'titular';

  INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
  SELECT group_id, user_id, role, CASE role WHEN 'titular' THEN 'creacion' ELSE 'solicitud' END,
         CASE role WHEN 'titular' THEN NULL ELSE gen_random_uuid() END
    FROM (SELECT DISTINCT ON (group_id, user_id) * FROM gm) d;

  INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                              issued_at, price_cents, currency, total_bs_cents, member_count,
                              base_share_cents, owner_share_cents, remainder_cents, finalized_at)
  SELECT gr.id, gr.owner_id, to_char(c.cut, 'YYYY-MM'), 'regular', c.cut, c.cut + 3,
         c.cut + interval '12 hours', 6000, 'BS', 6000, 4, 1500, 1500, 0,
         c.cut + interval '12 hours'
    FROM groups gr
    CROSS JOIN LATERAL (
      SELECT (date_trunc('month', now()) - make_interval(months => m))::date + 4 AS cut
        FROM generate_series(0, ${MONTHS - 1}) AS m
    ) c;

  -- Estado: los del último mes 'pendiente' (vencidos si el corte ya pasó), los anteriores
  -- 'pagado', y uno de cada diez 'atrasado'.
  INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                       price_cents, currency, total_bs_cents, member_count, issued_at, due_at,
                       paid_at, settled_by, settlement)
  SELECT bc.group_id, m.user_id, bc.id, bc.period, 'ciclo', s.status, 1500, 6000, 'BS', 6000, 4,
         bc.issued_at, bc.cut_date + interval '4 days 4 hours',
         CASE WHEN s.status = 'pagado' THEN bc.issued_at + interval '1 day' END,
         CASE WHEN s.status = 'pagado' THEN bc.owner_id END,
         CASE WHEN s.status = 'pagado' THEN 'manual' END
    FROM billing_cycles bc
    JOIN group_members m ON m.group_id = bc.group_id AND m.role = 'miembro'
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN bc.period = to_char(now(), 'YYYY-MM') THEN 'pendiente'
               WHEN abs(hashtext(m.user_id::text || bc.period)) % 10 = 0 THEN 'atrasado'
               ELSE 'pagado'
             END AS status
    ) s;`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let targetUserId: string;
let groupId: string;

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
    "SELECT id FROM users WHERE email = 'cobros1@example.com'",
  );
  assert.ok(rows[0]);
  targetUserId = rows[0].id;
  const { rows: groups } = await client.query<{ group_id: string }>(
    'SELECT group_id FROM group_members WHERE user_id = $1 LIMIT 1',
    [targetUserId],
  );
  assert.ok(groups[0]);
  groupId = groups[0].group_id;
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
  'Execution Time'?: number;
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

function seqScansOnCharges(plan: PlanNode): number {
  return walk(plan).filter(
    (node) => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'charges',
  ).length;
}

// ---------------------------------------------------------------- pruebas

test('RNF-002-05: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{ total: string; target: string }>(
    `SELECT (SELECT count(*) FROM charges) AS total,
            (SELECT count(*) FROM charges WHERE user_id = $1) AS target`,
    [targetUserId],
  );
  assert.equal(Number(rows[0]?.total), GROUPS * 3 * MONTHS);
  assert.equal(Number(rows[0]?.target), 20 * MONTHS);
});

test('RNF-002-05: «Mis cobros» lee charges por un índice de user_id, sin recorrer la tabla', async (t) => {
  const result = await explain(MY_CHARGES_SQL, [targetUserId, [], null, null, null, null, 20]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  assert.equal(seqScansOnCharges(result.Plan), 0, summary(result.Plan));
  assert.ok(
    indexesUsed(result.Plan).some((name) =>
      ['charges_user_status_idx', 'charges_user_period_idx', 'charges_member_period_uq'].includes(
        name,
      ),
    ),
    summary(result.Plan),
  );
});

test('RNF-002-05: el resumen del mes usa un índice por grupo y período', async (t) => {
  const period = new Date().toISOString().slice(0, 7);
  const result = await explain(GROUP_PERIOD_SQL, [groupId, period]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  assert.equal(seqScansOnCharges(result.Plan), 0, summary(result.Plan));
  assert.ok(
    indexesUsed(result.Plan).some((name) =>
      ['charges_group_period_idx', 'charges_member_period_uq'].includes(name),
    ),
    summary(result.Plan),
  );
});

test('RNF-002-05: el barrido de atrasos usa charges_overdue_idx', async (t) => {
  const result = await explain(OVERDUE_SQL, [new Date(), null]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  assert.equal(seqScansOnCharges(result.Plan), 0, summary(result.Plan));
  assert.ok(indexesUsed(result.Plan).includes('charges_overdue_idx'), summary(result.Plan));
});
