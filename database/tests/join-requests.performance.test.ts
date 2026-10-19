// Spec 010, T048 (RNF-010-07; data-model.md §1, índices de join_requests y join_messages): planes
// de consulta de «Mis solicitudes», la cola del titular, el chat con afterSeq y las insignias de la
// barra, con datos de volumen. Las consultas son copia de
// backend/src/modules/join-requests/repositories/requests.repository.ts (list con cada alcance,
// countActionableAsHost, countActiveAsApplicant) y messages.repository.ts (listAfter,
// unreadCount, unreadTotal); la lista de columnas se resume en jr.*. El barrido de vencimientos
// (T042) aún no existe en backend/src y no se revisa aquí. Todos los datos son ficticios.
//
// Volumen: 2.000 usuarios y 400 grupos con 50 solicitudes cada uno (20.000), más 60 del usuario
// objetivo; 5 mensajes por solicitud (unos 100.000) y 300 en una solicitud del objetivo. El
// titular objetivo tiene 20 grupos (1.000 solicitudes). La carga va con session_replication_role
// = replica (sin disparadores ni FK) para que tarde poco: las filas respetan los CHECK y los
// índices únicos, y los disparadores ya los prueba join-requests.integrity.test.ts. Después se
// corre ANALYZE y los planes se verifican sin forzar al planificador.
// Resultado: los índices de 0050 y 0052 bastan; ninguna consulta necesita un índice nuevo.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const USERS = 2000;
const GROUPS = 400;
const PER_GROUP = 50;
const TARGET_REQUESTS = 60;
// RNF-010-07: listar hasta 50 solicitudes en menos de 500 ms.
const PAGE = 50;
const BUDGET_MS = 500;

// ---------------------------------------------------------------- consultas del repositorio

const ACTIVE = "ARRAY['abierta', 'esperando_pago', 'pago_informado']";

// list(): una página de PAGE + 1 filas según el alcance.
const LIST_APPLICANT_SQL = `
  SELECT jr.* FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE jr.applicant_id = $1
   ORDER BY jr.opened_at DESC, jr.id DESC LIMIT $2`;

const LIST_APPLICANT_ACTIVE_SQL = `
  SELECT jr.* FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE jr.applicant_id = $1 AND jr.status = ANY(${ACTIVE}::text[])
   ORDER BY jr.opened_at DESC, jr.id DESC LIMIT $2`;

const LIST_HOST_SQL = `
  SELECT jr.* FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE g.owner_id = $1
   ORDER BY jr.opened_at ASC, jr.id ASC LIMIT $2`;

const LIST_EITHER_SQL = `
  SELECT jr.* FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE (jr.applicant_id = $1 OR g.owner_id = $1)
   ORDER BY jr.opened_at DESC, jr.id DESC LIMIT $2`;

const LIST_GROUP_SQL = `
  SELECT jr.* FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE jr.group_id = $1
   ORDER BY jr.opened_at ASC, jr.id ASC LIMIT $2`;

const COUNT_ACTIONABLE_SQL = `
  SELECT count(*)::text AS n FROM join_requests jr JOIN groups g ON g.id = jr.group_id
   WHERE g.owner_id = $1
     AND ((jr.status = 'abierta' AND jr.open_deadline_at > $2)
       OR (jr.status = 'pago_informado' AND jr.decision_deadline_at > $2))`;

const COUNT_ACTIVE_APPLICANT_SQL = `
  SELECT count(*)::text AS n FROM join_requests
   WHERE applicant_id = $1
     AND ((status = 'abierta' AND open_deadline_at > $2)
       OR (status = 'esperando_pago' AND pay_deadline_at > $2)
       OR (status = 'pago_informado' AND decision_deadline_at > $2))`;

// listAfter(): sondeo del chat con afterSeq (R3).
const CHAT_AFTER_SQL = `
  SELECT * FROM join_messages
   WHERE request_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`;

const UNREAD_COUNT_SQL = `
  SELECT count(*)::text AS n
    FROM join_messages m
    LEFT JOIN join_request_reads r ON r.request_id = m.request_id AND r.user_id = $2
   WHERE m.request_id = $1 AND m.sender_id <> $2 AND m.seq > COALESCE(r.last_read_seq, 0)`;

const UNREAD_TOTAL_SQL = `
  SELECT count(*)::text AS n
    FROM join_messages m
    JOIN join_requests jr ON jr.id = m.request_id
    JOIN groups g ON g.id = jr.group_id
    LEFT JOIN join_request_reads r ON r.request_id = m.request_id AND r.user_id = $1
   WHERE (jr.applicant_id = $1 OR g.owner_id = $1)
     AND m.sender_id <> $1 AND m.seq > COALESCE(r.last_read_seq, 0)`;

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version)
  SELECT 'Persona de Volumen ' || g, 'solic' || g || '@example.com',
         md5('email:solic' || g), $1, '\\x01'::bytea, md5('ci:' || (5000000 + g)),
         '+5917' || lpad(g::text, 7, '0'), 710000000 + g, now(), '2026-10-18'
    FROM generate_series(1, ${USERS}) AS g;

  CREATE TEMP TABLE u AS
    SELECT id, substring(email FROM 'solic([0-9]+)@')::int AS n FROM users;

  -- Grupo gn: titular = usuario 2 (el titular objetivo) en los 20 primeros, usuario gn + 1 en el
  -- resto.
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code)
  SELECT u.id, 'Grupo ' || gn, 'Servicio', 6000, 'BS', 5, 5,
         translate(lpad(to_hex(gn * 7919), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS')
    FROM generate_series(1, ${GROUPS}) AS gn
    JOIN u ON u.n = CASE WHEN gn <= 20 THEN 2 ELSE gn + 1 END;

  CREATE TEMP TABLE gr AS
    SELECT id, owner_id, row_number() OVER (ORDER BY id) AS gn FROM groups;

  -- Solicitantes: PER_GROUP por grupo, distintos dentro del grupo, más el usuario 1 (el objetivo)
  -- en TARGET_REQUESTS grupos que no son del titular objetivo.
  CREATE TEMP TABLE req AS
    SELECT gr.id AS group_id, u.id AS applicant_id, k
      FROM gr
      CROSS JOIN generate_series(1, ${PER_GROUP}) AS k
      JOIN u ON u.n = 402 + ((gr.gn * ${PER_GROUP} + k) % (${USERS} - 402))
    UNION ALL
    SELECT t.id, u.id, 0
      FROM (SELECT gr.id FROM gr JOIN u ON u.id = gr.owner_id
             WHERE u.n <> 2 ORDER BY gr.gn LIMIT ${TARGET_REQUESTS}) t
      JOIN u ON u.n = 1;

  -- Estado: una de cada diez 'abierta' (vigente), el resto 'expirada' o 'cancelada'. El objetivo
  -- tiene a lo sumo 5 activas (RF-010-02), como exige el disparador que aquí no corre.
  INSERT INTO join_requests (group_id, applicant_id, status, opened_at, open_deadline_at,
                             final_at, final_reason)
  SELECT r.group_id, r.applicant_id, s.status, s.opened_at, s.opened_at + interval '24 hours',
         CASE WHEN s.status <> 'abierta' THEN s.opened_at + interval '24 hours' END,
         CASE s.status WHEN 'expirada' THEN 'plazo_solicitud'
                       WHEN 'cancelada' THEN 'cancelada_solicitante' END
    FROM req r
    CROSS JOIN LATERAL (
      SELECT now() - make_interval(hours => abs(hashtext(r.group_id::text || r.applicant_id::text))
                                            % 8760 + 1) AS opened_at,
             abs(hashtext(r.applicant_id::text || r.group_id::text)) % 10 AS h
    ) x
    CROSS JOIN LATERAL (
      SELECT CASE WHEN (r.k = 0 AND x.h < 1) OR (r.k > 0 AND x.h = 0) THEN 'abierta'
                  WHEN x.h % 2 = 0 THEN 'expirada'
                  ELSE 'cancelada' END AS status,
             CASE WHEN (r.k = 0 AND x.h < 1) OR (r.k > 0 AND x.h = 0)
                  THEN now() - interval '1 hour' ELSE x.opened_at END AS opened_at
    ) s;

  -- Chat: 5 mensajes por solicitud, alternando solicitante y titular.
  INSERT INTO join_messages (request_id, sender_id, body, created_at, updated_at)
  SELECT jr.id, CASE WHEN m % 2 = 1 THEN jr.applicant_id ELSE g.owner_id END,
         'Mensaje ' || m, jr.opened_at + make_interval(mins => m),
         jr.opened_at + make_interval(mins => m)
    FROM join_requests jr JOIN groups g ON g.id = jr.group_id
    CROSS JOIN generate_series(1, 5) AS m;

  -- Cada participante leyó hasta el tercer mensaje de cada solicitud.
  INSERT INTO join_request_reads (request_id, user_id, last_read_seq)
  SELECT p.request_id, p.user_id,
         (SELECT seq FROM join_messages WHERE request_id = p.request_id ORDER BY seq OFFSET 2 LIMIT 1)
    FROM (SELECT jr.id AS request_id, jr.applicant_id AS user_id FROM join_requests jr
          UNION ALL
          SELECT jr.id, g.owner_id FROM join_requests jr JOIN groups g ON g.id = jr.group_id) p`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let applicantId: string;
let hostId: string;
let groupId: string;
let chatRequestId: string;

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
  const { rows: ids } = await client.query<{ applicant: string; host: string }>(
    `SELECT (SELECT id FROM users WHERE email = 'solic1@example.com') AS applicant,
            (SELECT id FROM users WHERE email = 'solic2@example.com') AS host`,
  );
  assert.ok(ids[0]);
  applicantId = ids[0].applicant;
  hostId = ids[0].host;
  const { rows: chat } = await client.query<{ id: string; group_id: string; owner_id: string }>(
    `SELECT jr.id, jr.group_id, g.owner_id FROM join_requests jr JOIN groups g ON g.id = jr.group_id
      WHERE jr.applicant_id = $1 ORDER BY jr.opened_at DESC LIMIT 1`,
    [applicantId],
  );
  assert.ok(chat[0]);
  chatRequestId = chat[0].id;
  await client.query(
    `INSERT INTO join_messages (request_id, sender_id, body)
     SELECT $1, CASE WHEN m % 2 = 1 THEN $2::uuid ELSE $3::uuid END, 'Mensaje largo ' || m
       FROM generate_series(1, 300) AS m`,
    [chatRequestId, applicantId, chat[0].owner_id],
  );
  await client.query('COMMIT');
  await client.query('ANALYZE users, groups, join_requests, join_messages, join_request_reads');

  const { rows: groups } = await client.query<{ id: string }>(
    'SELECT id FROM groups WHERE owner_id = $1 LIMIT 1',
    [hostId],
  );
  assert.ok(groups[0]);
  groupId = groups[0].id;
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

test('RNF-010-07: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{ total: string; target: string; host: string }>(
    `SELECT (SELECT count(*) FROM join_requests) AS total,
            (SELECT count(*) FROM join_requests WHERE applicant_id = $1) AS target,
            (SELECT count(*) FROM join_requests jr JOIN groups g ON g.id = jr.group_id
              WHERE g.owner_id = $2) AS host`,
    [applicantId, hostId],
  );
  assert.equal(Number(rows[0]?.total), GROUPS * PER_GROUP + TARGET_REQUESTS);
  assert.equal(Number(rows[0]?.target), TARGET_REQUESTS);
  assert.equal(Number(rows[0]?.host), 20 * PER_GROUP);
});

test('RNF-010-07: «Mis solicitudes» como solicitante usa join_requests_applicant_idx y responde en menos de 500 ms', async (t) => {
  for (const sql of [LIST_APPLICANT_SQL, LIST_APPLICANT_ACTIVE_SQL]) {
    const result = await explain(sql, [applicantId, PAGE + 1]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    assert.equal(seqScansOn(result.Plan, 'join_requests'), 0, summary(result.Plan));
    assert.ok(
      indexesUsed(result.Plan).includes('join_requests_applicant_idx'),
      summary(result.Plan),
    );
    assert.ok(result['Execution Time'] < BUDGET_MS, `${result['Execution Time']} ms`);
  }
});

test('RNF-010-07: la cola del grupo usa join_requests_group_idx', async (t) => {
  const result = await explain(LIST_GROUP_SQL, [groupId, PAGE + 1]);
  t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
  assert.equal(seqScansOn(result.Plan, 'join_requests'), 0, summary(result.Plan));
  assert.ok(indexesUsed(result.Plan).includes('join_requests_group_idx'), summary(result.Plan));
  assert.ok(result['Execution Time'] < BUDGET_MS, `${result['Execution Time']} ms`);
});

// Filtran por groups.owner_id: el planificador recorre join_requests y lo cruza por hash con los
// grupos del titular. Un índice sobre groups (owner_id) no cambia ese recorrido (se probó), y con
// 20.000 solicitudes tarda unos 15 ms, lejos de los 500 ms: no hace falta un índice nuevo.
test('RNF-010-07: «Mis solicitudes» como titular o sin rol responde en menos de 500 ms', async (t) => {
  for (const [sql, param] of [
    [LIST_HOST_SQL, hostId],
    [LIST_EITHER_SQL, applicantId],
    [LIST_EITHER_SQL, hostId],
  ] as const) {
    const result = await explain(sql, [param, PAGE + 1]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    assert.ok(result['Execution Time'] < BUDGET_MS, `${result['Execution Time']} ms`);
  }
});

test('RNF-010-07: los contadores de la barra leen join_requests por índice', async (t) => {
  const now = new Date();
  for (const [sql, param] of [
    [COUNT_ACTIONABLE_SQL, hostId],
    [COUNT_ACTIVE_APPLICANT_SQL, applicantId],
  ] as const) {
    const result = await explain(sql, [param, now]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    assert.equal(seqScansOn(result.Plan, 'join_requests'), 0, summary(result.Plan));
    assert.ok(indexesUsed(result.Plan).length > 0, summary(result.Plan));
  }
});

test('RNF-010-07: el chat con afterSeq y los no leídos de una solicitud usan join_messages_request_idx', async (t) => {
  const { rows } = await client.query<{ seq: string }>(
    'SELECT seq::text FROM join_messages WHERE request_id = $1 ORDER BY seq OFFSET 250 LIMIT 1',
    [chatRequestId],
  );
  assert.ok(rows[0]);
  for (const [sql, params] of [
    [CHAT_AFTER_SQL, [chatRequestId, Number(rows[0].seq), 100]],
    [CHAT_AFTER_SQL, [chatRequestId, 0, 100]],
    [UNREAD_COUNT_SQL, [chatRequestId, applicantId]],
  ] as const) {
    const result = await explain(sql, [...params]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    assert.equal(seqScansOn(result.Plan, 'join_messages'), 0, summary(result.Plan));
    assert.ok(indexesUsed(result.Plan).includes('join_messages_request_idx'), summary(result.Plan));
  }
});

test('RNF-010-07: el total de no leídos de la barra responde en menos de 500 ms', async (t) => {
  for (const user of [applicantId, hostId]) {
    const result = await explain(UNREAD_TOTAL_SQL, [user]);
    t.diagnostic(`plan: ${summary(result.Plan)}; ${result['Execution Time']} ms`);
    assert.ok(result['Execution Time'] < BUDGET_MS, `${result['Execution Time']} ms`);
  }
});
