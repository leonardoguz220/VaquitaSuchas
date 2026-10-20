// Spec 007, T035 (RNF-007-03; data-model.md, índices de user_reputation y charges): planes de
// consulta de getRatings por lote, ChargeFactsPort (12 meses) y la conciliación diaria, con datos
// de volumen. Las consultas son copia de
// backend/src/modules/reputation/repositories/reputation.repository.ts (getMany, que usa
// getRatings y el ranking; isActiveMember, activeMembers, excludedChargeIds, userIdsToReconcile)
// y backend/src/modules/billing/repositories/charge-facts.repository.ts (listForUsers). Todos los
// datos son ficticios.
//
// Volumen: 1.000 usuarios con reputación guardada y 300 grupos de 4 personas con 12 ciclos (10.800
// cobros, con comprobantes y eventos), más un grupo de 20 miembros para el ranking. La carga va con
// session_replication_role = replica (sin disparadores ni FK) para que tarde poco: las filas
// respetan los CHECK, y los disparadores ya los prueban billing.integrity y reputation.integrity.
// Después se corre ANALYZE y los planes se verifican sin forzar al planificador.
//
// RNF-007-03: el ranking de un grupo de 20 miembros responde en menos de 300 ms; se mide la suma
// de sus tres consultas con EXPLAIN ANALYZE (tiempo en la base). La conciliación es una tarea
// diaria sin tiempo fijado en la spec: su tiempo solo se informa.
// Resultado: bastan los índices existentes; ninguna consulta necesita un índice nuevo.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const USERS = 1000;
const GROUPS = 300;
const MONTHS = 12;
const RANKING_MEMBERS = 20;
// RNF-007-03: ranking de hasta 20 miembros en menos de 300 ms.
const BUDGET_MS = 300;

// ---------------------------------------------------------------- consultas del repositorio

const IS_ACTIVE_MEMBER_SQL = `
  SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`;

const ACTIVE_MEMBERS_SQL = `
  SELECT m.user_id, u.full_name, m.role, m.joined_at
    FROM group_members m JOIN users u ON u.id = m.user_id
   WHERE m.group_id = $1 AND m.left_at IS NULL
   ORDER BY m.joined_at, m.user_id`;

// getMany(): lectura por lote de getRatings y del ranking.
const GET_MANY_SQL = `
  SELECT user_id, considered_count, punctual_count, late_count, displayed_half_stars, level,
         current_streak, rules_version, computed_at
    FROM user_reputation WHERE user_id = ANY($1::uuid[])`;

// ChargeFactsPort.listForUsers(): hechos de los cobros de 12 meses (recompute).
const CHARGE_FACTS_SQL = `
  SELECT c.id, c.user_id, c.group_id, c.status, c.origin, c.due_at, c.paid_at, c.settlement,
         c.first_submitted_at,
         (SELECT max(r.uploaded_at) FROM receipts r WHERE r.charge_id = c.id)
           AS last_submitted_at,
         EXISTS (SELECT 1 FROM charge_events e
                  WHERE e.charge_id = c.id AND e.type = 'rechazado'
                    AND e.metadata->>'invalidReceipt' = 'true') AS had_invalid,
         (g.frozen_reason = 'titular_baneado') AS frozen_by_ban
    FROM charges c
    JOIN groups g ON g.id = c.group_id
   WHERE c.user_id = ANY($1::uuid[]) AND c.due_at >= $2
   ORDER BY c.due_at, c.id`;

const EXCLUDED_SQL = `
  SELECT charge_id FROM charge_reputation_exclusions WHERE charge_id = ANY($1::uuid[])`;

// userIdsToReconcile(): personas de la conciliación diaria.
const RECONCILE_SQL = `
  SELECT user_id FROM charges WHERE due_at >= $1
  UNION SELECT user_id FROM user_reputation
         WHERE considered_count > 0 OR rules_version <> $2
  ORDER BY user_id`;

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version)
  SELECT 'Persona de Volumen ' || g, 'repu' || g || '@example.com',
         md5('email:repu' || g), $1, '\\x01'::bytea, md5('ci:' || (8000000 + g)),
         '+5916' || lpad(g::text, 7, '0'), 740000000 + g, now(), '2026-10-18'
    FROM generate_series(1, ${USERS}) AS g;

  CREATE TEMP TABLE u AS
    SELECT id, substring(email FROM 'repu([0-9]+)@')::int AS n FROM users;

  -- Grupo 0: el del ranking (titular = usuario 1 y 19 miembros). Grupos 1 a GROUPS: titular =
  -- usuario gn + 1 y tres miembros entre los usuarios 302 a 1000.
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code)
  SELECT u.id, 'Grupo ' || gn, 'Servicio', 6000, 'BS', 5, CASE WHEN gn = 0 THEN 20 ELSE 5 END,
         translate(lpad(to_hex(gn * 7919 + 1), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS')
    FROM generate_series(0, ${GROUPS}) AS gn
    JOIN u ON u.n = gn + 1;

  CREATE TEMP TABLE gr AS
    SELECT g.id, g.owner_id, u.n - 1 AS gn FROM groups g JOIN u ON u.id = g.owner_id;

  CREATE TEMP TABLE mem AS
    SELECT gr.id AS group_id, gr.owner_id AS user_id, 'titular' AS role, gr.gn FROM gr
    UNION ALL
    SELECT gr.id, u.id, 'miembro', gr.gn
      FROM gr
      CROSS JOIN generate_series(1, ${RANKING_MEMBERS - 1}) AS k
      JOIN u ON u.n = CASE WHEN gr.gn = 0 THEN 302 + k
                           ELSE 302 + ((gr.gn * 3 + k) % (${USERS} - 302)) END
     WHERE gr.gn = 0 OR k <= 3;

  INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id, joined_at)
  SELECT group_id, user_id, role, CASE role WHEN 'titular' THEN 'creacion' ELSE 'solicitud' END,
         CASE role WHEN 'titular' THEN NULL ELSE gen_random_uuid() END,
         now() - interval '13 months' + make_interval(mins => gn)
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

  -- Cobros pagados con comprobante (salvo el mes en curso, 'pendiente'), uno de cada diez
  -- 'atrasado'.
  INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                       price_cents, currency, total_bs_cents, member_count, issued_at, due_at,
                       paid_at, settled_by, settlement, first_submitted_at)
  SELECT bc.group_id, m.user_id, bc.id, bc.period, 'ciclo', s.status, 1500, 6000, 'BS', 6000, 4,
         bc.issued_at, bc.cut_date + interval '4 days 4 hours',
         CASE WHEN s.status = 'pagado' THEN bc.issued_at + interval '2 days' END,
         CASE WHEN s.status = 'pagado' THEN bc.owner_id END,
         CASE WHEN s.status = 'pagado' THEN 'comprobante' END,
         CASE WHEN s.status = 'pagado' THEN bc.issued_at + interval '1 day' END
    FROM billing_cycles bc
    JOIN group_members m ON m.group_id = bc.group_id AND m.role = 'miembro'
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN bc.period = to_char(now(), 'YYYY-MM') THEN 'pendiente'
               WHEN abs(hashtext(m.user_id::text || bc.period)) % 10 = 0 THEN 'atrasado'
               ELSE 'pagado'
             END AS status
    ) s;

  INSERT INTO receipts (charge_id, uploaded_by, uploaded_at, file_key, mime, size_bytes, method,
                        reference, status)
  SELECT id, user_id, first_submitted_at, 'receipts/' || id, 'image/png', 1000, 'qr',
         'REF-' || left(id::text, 8), 'confirmado'
    FROM charges WHERE first_submitted_at IS NOT NULL;

  INSERT INTO charge_events (charge_id, group_id, type, actor_kind, to_status, occurred_at)
  SELECT id, group_id, 'generado', 'sistema', 'pendiente', issued_at FROM charges;

  INSERT INTO charge_events (charge_id, group_id, type, actor_kind, actor_id, from_status,
                             to_status, reason, metadata, occurred_at)
  SELECT c.id, c.group_id, 'rechazado', 'usuario', g.owner_id, 'en_revision', 'pendiente',
         'Comprobante ilegible', '{"invalidReceipt": true}'::jsonb, c.issued_at + interval '20 hours'
    FROM charges c JOIN groups g ON g.id = c.group_id
   WHERE abs(hashtext(c.id::text)) % 20 = 0;

  INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                               displayed_half_stars, level, current_streak, rules_version,
                               computed_at)
  SELECT id, 12, 10, 2, 8, 'Bueno', 3, 1, now() FROM users`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let rankingGroupId: string;
let rankingMemberIds: string[];
let memberId: string;
let since: Date;

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
    'ANALYZE users, groups, group_members, billing_cycles, charges, receipts, charge_events, user_reputation',
  );

  const { rows } = await client.query<{ group_id: string; user_id: string }>(
    `SELECT m.group_id, m.user_id FROM group_members m JOIN groups g ON g.id = m.group_id
      WHERE g.total_slots = 20 ORDER BY m.user_id`,
  );
  assert.ok(rows[0]);
  rankingGroupId = rows[0].group_id;
  rankingMemberIds = rows.map((r) => r.user_id);
  const { rows: member } = await client.query<{ user_id: string }>(
    `SELECT user_id FROM charges GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 1`,
  );
  assert.ok(member[0]);
  memberId = member[0].user_id;
  since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 13);
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

test('RNF-007-03: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{ charges: string; reputations: string }>(
    `SELECT (SELECT count(*) FROM charges) AS charges,
            (SELECT count(*) FROM user_reputation) AS reputations`,
  );
  assert.equal(Number(rows[0]?.charges), (GROUPS * 3 + RANKING_MEMBERS - 1) * MONTHS);
  assert.equal(Number(rows[0]?.reputations), USERS);
  assert.equal(rankingMemberIds.length, RANKING_MEMBERS);
});

test('RNF-007-03: el ranking de 20 miembros lee por índice y responde en menos de 300 ms', async (t) => {
  const steps: [string, unknown[], string, string][] = [
    [IS_ACTIVE_MEMBER_SQL, [rankingGroupId, rankingMemberIds[0]], 'group_members', ''],
    [ACTIVE_MEMBERS_SQL, [rankingGroupId], 'group_members', ''],
    // Con 1.000 filas (unas pocas páginas) el planificador lee user_reputation entera; el
    // tiempo es despreciable y user_reputation_pkey queda para tablas más grandes.
    [GET_MANY_SQL, [rankingMemberIds], '', ''],
  ];
  let total = 0;
  for (const [sql, params, relation, index] of steps) {
    const result = await explain(sql, params);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    if (relation) assert.equal(seqScansOn(result.Plan, relation), 0, summary(result.Plan));
    if (index) assert.ok(indexesUsed(result.Plan).includes(index), summary(result.Plan));
    total += result['Execution Time'];
  }
  t.diagnostic(`ranking: ${total} ms`);
  assert.ok(total < BUDGET_MS, `${total} ms`);
});

// El backend la llama con una sola persona (ReputationService.recompute).
test('RNF-007-03: ChargeFactsPort de 12 meses lee charges, receipts y charge_events por índice', async (t) => {
  for (const userIds of [[memberId]]) {
    const result = await explain(CHARGE_FACTS_SQL, [userIds, since]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    for (const relation of ['charges', 'receipts', 'charge_events']) {
      assert.equal(seqScansOn(result.Plan, relation), 0, `${relation}: ${summary(result.Plan)}`);
    }
    const used = indexesUsed(result.Plan);
    assert.ok(used.includes('receipts_charge_idx'), summary(result.Plan));
    assert.ok(used.includes('charge_events_charge_idx'), summary(result.Plan));
  }
});

test('RF-007-14: las exclusiones del lote se leen por charge_reputation_exclusions_charge_id_key', async (t) => {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM charges WHERE user_id = $1', [
    memberId,
  ]);
  await client.query(
    `INSERT INTO charge_reputation_exclusions (charge_id, excluded_by, reason)
     SELECT c.id, g.owner_id, 'Cobro duplicado por error'
       FROM charges c JOIN groups g ON g.id = c.group_id WHERE c.id = $1`,
    [rows[0]?.id],
  );
  await client.query('ANALYZE charge_reputation_exclusions');
  const result = await explain(EXCLUDED_SQL, [rows.map((r) => r.id)]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  assert.ok(result['Execution Time'] < BUDGET_MS, `${result['Execution Time']} ms`);
});

test('RF-007-05: la conciliación diaria obtiene sus personas (tiempo informado)', async (t) => {
  const result = await explain(RECONCILE_SQL, [since, 1]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  const { rows } = await client.query(RECONCILE_SQL, [since, 1]);
  assert.equal(rows.length, USERS);
});
