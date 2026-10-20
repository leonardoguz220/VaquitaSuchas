// Spec 008, T027 (RNF-008-02; data-model.md, índices de listings): planes de consulta de la
// búsqueda de cupos libres con 5.000 publicaciones y del barrido diario. Las consultas son copia de
// backend/src/modules/listings/repositories/listings-search.repository.ts (search con cada orden y
// filtro) y listings.repository.ts (listNeedingAttention, listExpiredActiveIds); la lista de
// columnas se resume. Todos los datos son ficticios.
//
// Volumen: 5.000 grupos de un catálogo de 6 servicios, cada uno con titular, dos miembros y una
// publicación (90 % 'activa', el resto 'oculta' o 'expirada'), reputación de los titulares y
// algunas solicitudes que reservan cupo. La carga va con session_replication_role = replica (sin
// disparadores ni FK) para que tarde poco: las filas respetan los CHECK, y los disparadores ya los
// prueba listings.integrity.test.ts. Después se corre ANALYZE.
//
// RNF-008-02 (< 500 ms): cada búsqueda se ejecuta RUNS veces con EXPLAIN ANALYZE y se toma el
// percentil 95 del tiempo de ejecución en la base. El barrido es una tarea programada sin tiempo
// fijado en la spec: su tiempo solo se informa.
// Resultado: la búsqueda recorre las publicaciones activas y cuenta miembros y reservas por grupo
// con índices; con 5.000 publicaciones el p95 más alto es de unos 80 ms. No hace falta un índice
// nuevo.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const LISTINGS = 5000;
const MEMBERS = 1000;
const RUNS = 10;
// RNF-008-02: menos de 500 ms con hasta 5.000 publicaciones.
const BUDGET_MS = 500;
// Página de 20 más una fila para saber si hay otra.
const LIMIT = 21;

// ---------------------------------------------------------------- consultas del repositorio

const FROM = `
  FROM listings l
  JOIN groups g ON g.id = l.group_id
  JOIN users u ON u.id = g.owner_id
  LEFT JOIN catalog_plans cp ON cp.id = g.catalog_plan_id
  LEFT JOIN catalog_services cs ON cs.id = cp.service_id
  LEFT JOIN user_reputation ur ON ur.user_id = g.owner_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS members FROM group_members gm
     WHERE gm.group_id = g.id AND gm.left_at IS NULL
  ) m
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS reserved FROM join_requests jr
     WHERE jr.group_id = g.id
       AND ((jr.status = 'esperando_pago' AND jr.pay_deadline_at > $1)
         OR (jr.status = 'pago_informado' AND jr.decision_deadline_at > $1))
  ) r
  CROSS JOIN LATERAL (
    SELECT greatest(0, least(l.slots_offered, g.total_slots - m.members - r.reserved)) AS offered
  ) e
  CROSS JOIN LATERAL (
    SELECT g.total_bs_cents / (m.members + e.offered) AS share
  ) s`;

const VISIBLE = `
  l.status = 'activa' AND l.expires_at > $1
  AND g.status = 'activo' AND g.frozen_at IS NULL AND g.accepting_members
  AND u.status = 'activo'
  AND g.owner_id <> $2
  AND NOT EXISTS (
    SELECT 1 FROM group_members mine
     WHERE mine.group_id = g.id AND mine.user_id = $2 AND mine.left_at IS NULL
  )`;

const SELECT = `
  SELECT l.id, g.id AS group_id, g.owner_id, u.full_name AS owner_name, cs.category, m.members,
         e.offered, l.published_at, s.share::text AS share_cents`;

const ORDER = {
  fecha: 'l.published_at DESC, l.id DESC',
  cuota: 's.share ASC, l.published_at DESC, l.id DESC',
  puntualidad: 'coalesce(ur.displayed_half_stars, -1) DESC, l.published_at DESC, l.id DESC',
} as const;

/** search(): `extra` son las condiciones de los filtros, con parámetros desde $3. */
const searchSql = (sort: keyof typeof ORDER, extra: string[], limitParam: number): string => `
  ${SELECT}
  ${FROM}
  WHERE ${[VISIBLE, 'e.offered >= 1', ...extra].join('\n AND ')}
  ORDER BY ${ORDER[sort]}
  LIMIT $${limitParam}`;

const NEEDING_ATTENTION_SQL = `
  SELECT l.id, l.group_id
    FROM listings l
    JOIN groups g ON g.id = l.group_id
    JOIN users u ON u.id = g.owner_id
   WHERE l.status IN ('activa', 'oculta')
     AND ((l.status = 'activa' AND l.expires_at <= $1)
          OR g.status = 'cerrado' OR g.frozen_at IS NOT NULL OR u.status = 'baneado'
          OR l.slots_offered > g.total_slots - (
               SELECT count(*) FROM group_members m
                WHERE m.group_id = g.id AND m.left_at IS NULL))
   ORDER BY l.id LIMIT $2`;

const EXPIRED_ACTIVE_SQL = `
  SELECT id FROM listings WHERE status = 'activa' AND expires_at <= $1 ORDER BY id LIMIT $2`;

// ---------------------------------------------------------------- datos de volumen

const LOAD_SQL = `
  INSERT INTO catalog_services (slug, name, category)
  VALUES ('netflix', 'Netflix', 'video'), ('spotify', 'Spotify', 'musica'),
         ('youtube-premium', 'YouTube Premium', 'video'), ('xbox-game-pass', 'Xbox Game Pass', 'juegos'),
         ('duolingo', 'Duolingo', 'educacion'), ('google-one', 'Google One', 'almacenamiento');

  INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots)
  SELECT id, slug || '-familiar', 'Familiar', 6000, 'BS', 6 FROM catalog_services;

  CREATE TEMP TABLE pl AS
    SELECT cp.id, cs.name, row_number() OVER (ORDER BY cs.slug) - 1 AS n
      FROM catalog_plans cp JOIN catalog_services cs ON cs.id = cp.service_id;

  -- Usuarios 1 a LISTINGS: titulares; LISTINGS + 1 a LISTINGS + MEMBERS: miembros; el último
  -- busca. Uno de cada 200 titulares está suspendido.
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, data_policy_accepted_at,
                     data_policy_version, status)
  SELECT 'Persona de Volumen ' || g, 'cupos' || g || '@example.com',
         md5('email:cupos' || g), $1, '\\x01'::bytea, md5('ci:' || (9000000 + g)),
         '+5916' || lpad(g::text, 7, '0'), 750000000 + g, now(), '2026-10-18',
         CASE WHEN g <= ${LISTINGS} AND g % 200 = 0 THEN 'suspendido' ELSE 'activo' END
    FROM generate_series(1, ${LISTINGS + MEMBERS + 1}) AS g;

  CREATE TEMP TABLE u AS
    SELECT id, substring(email FROM 'cupos([0-9]+)@')::int AS n FROM users;

  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code, catalog_plan_id, plan_name_snapshot,
                      plan_max_slots_snapshot, created_at)
  SELECT u.id, 'Grupo ' || u.n, pl.name, 6000 + (u.n % 7) * 500, 'BS', 1 + u.n % 28, 6,
         translate(lpad(to_hex(u.n * 7919), 8, 'A'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS'),
         pl.id, 'Familiar', 6, now() - make_interval(days => u.n % 300)
    FROM u JOIN pl ON pl.n = u.n % 6
   WHERE u.n <= ${LISTINGS};

  CREATE TEMP TABLE gr AS
    SELECT g.id, g.owner_id, u.n FROM groups g JOIN u ON u.id = g.owner_id;

  INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
  SELECT gr.id, gr.owner_id, 'titular', 'creacion', NULL FROM gr
  UNION ALL
  SELECT gr.id, u.id, 'miembro', 'solicitud', gen_random_uuid()
    FROM gr CROSS JOIN generate_series(1, 2) AS k
    JOIN u ON u.n = ${LISTINGS} + 1 + ((gr.n * 2 + k) % ${MEMBERS});

  INSERT INTO listings (group_id, slots_offered, description, status, published_at, expires_at,
                        hidden_at)
  SELECT gr.id, 1 + gr.n % 3, 'Cupo libre en el grupo ' || gr.n,
         CASE gr.n % 10 WHEN 0 THEN 'oculta' WHEN 1 THEN 'expirada' ELSE 'activa' END,
         p.published_at, p.published_at + interval '30 days',
         CASE WHEN gr.n % 10 = 0 THEN now() - interval '1 hour' END
    FROM gr
    CROSS JOIN LATERAL (
      SELECT now() - make_interval(hours => gr.n % 700)
             - CASE WHEN gr.n % 10 = 1 THEN interval '40 days' ELSE interval '0' END AS published_at
    ) p;

  -- Una de cada cinco publicaciones tiene una solicitud que reserva cupo.
  INSERT INTO join_requests (group_id, applicant_id, source, listing_id, status, opened_at,
                             open_deadline_at, quote_amount_cents, quote_price_cents,
                             quote_currency, quote_total_bs_cents, quote_member_count,
                             payment_sent_at, pay_deadline_at)
  SELECT l.group_id, u.id, 'publicacion', l.id, 'esperando_pago', now() - interval '1 hour',
         now() + interval '23 hours', 1500, 6000, 'BS', 6000, 4, now() - interval '5 minutes',
         now() + interval '10 minutes'
    FROM listings l JOIN gr ON gr.id = l.group_id
    JOIN u ON u.n = ${LISTINGS} + 1 + ((gr.n * 2 + 5) % ${MEMBERS})
   WHERE gr.n % 5 = 0;

  INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                               displayed_half_stars, level, current_streak, rules_version,
                               computed_at)
  SELECT owner_id, 12, 12 - n % 5, n % 5, 10 - n % 5, 'Bueno', 3, 1, now() FROM gr
   WHERE n % 4 <> 0`;

// ---------------------------------------------------------------- base y conexión

let db: TempDatabase;
let client: pg.Client;
let searcherId: string;
let serviceId: string;
let middle: { published_at: Date; id: string };

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
    'ANALYZE users, catalog_services, catalog_plans, groups, group_members, listings, join_requests, user_reputation',
  );

  const { rows } = await client.query<{ searcher: string; service: string }>(
    `SELECT (SELECT id FROM users WHERE email = 'cupos${LISTINGS + MEMBERS + 1}@example.com')
              AS searcher,
            (SELECT id FROM catalog_services WHERE slug = 'netflix') AS service`,
  );
  assert.ok(rows[0]);
  searcherId = rows[0].searcher;
  serviceId = rows[0].service;
  const { rows: page } = await client.query<{ published_at: Date; id: string }>(
    `SELECT published_at, id FROM listings WHERE status = 'activa'
      ORDER BY published_at DESC, id DESC OFFSET 1000 LIMIT 1`,
  );
  assert.ok(page[0]);
  middle = page[0];
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

test('RNF-008-02: el volumen de prueba quedó cargado', async () => {
  const { rows } = await client.query<{ total: string; active: string }>(
    `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'activa') AS active FROM listings`,
  );
  assert.equal(Number(rows[0]?.total), LISTINGS);
  assert.equal(Number(rows[0]?.active), (LISTINGS * 8) / 10);
});

test('RNF-008-02: la búsqueda con cada orden, filtro y cursor responde en menos de 500 ms', async (t) => {
  const now = new Date();
  const cases: [string, string, unknown[]][] = [
    ['fecha', searchSql('fecha', [], 3), [now, searcherId, LIMIT]],
    ['cuota', searchSql('cuota', [], 3), [now, searcherId, LIMIT]],
    ['puntualidad', searchSql('puntualidad', [], 3), [now, searcherId, LIMIT]],
    [
      'servicio',
      searchSql('fecha', ['cp.service_id = $3::uuid'], 4),
      [now, searcherId, serviceId, LIMIT],
    ],
    ['categoría', searchSql('fecha', ['cs.category = $3'], 4), [now, searcherId, 'video', LIMIT]],
    [
      'texto',
      searchSql(
        'fecha',
        [
          "immutable_unaccent(lower(g.service_name_snapshot)) LIKE '%' || immutable_unaccent(lower($3)) || '%' ESCAPE '\\'",
        ],
        4,
      ),
      [now, searcherId, 'spoti', LIMIT],
    ],
    [
      'cuota entre',
      searchSql('cuota', ['s.share >= $3', 's.share <= $4'], 5),
      [now, searcherId, 1000, 1500, LIMIT],
    ],
    [
      'cursor',
      searchSql('fecha', ['(l.published_at, l.id) < ($3::timestamptz, $4::uuid)'], 5),
      [now, searcherId, middle.published_at, middle.id, LIMIT],
    ],
  ];
  for (const [name, sql, params] of cases) {
    const { plan, p95 } = await measure(sql, params);
    t.diagnostic(`${name}: ${summary(plan)}; p95 ${p95} ms`);
    assert.ok(p95 < BUDGET_MS, `${name}: p95 ${p95} ms`);
  }
});

test('RNF-008-02: las cuentas por grupo de la búsqueda usan índices de group_members y join_requests', async () => {
  const result = await explain(searchSql('fecha', [], 3), [new Date(), searcherId, LIMIT]);
  const used = indexesUsed(result.Plan);
  assert.ok(
    used.some((name) => name.startsWith('group_members_')),
    summary(result.Plan),
  );
  assert.ok(
    used.some((name) => name.startsWith('join_requests_')),
    summary(result.Plan),
  );
});

test('RF-008-12: el barrido de publicaciones obtiene sus candidatas (tiempo informado)', async (t) => {
  const now = new Date();
  const attention = await explain(NEEDING_ATTENTION_SQL, [now, 500]);
  t.diagnostic(
    `listNeedingAttention: ${summary(attention.Plan)}; ${attention['Execution Time']} ms`,
  );
  const expired = await explain(EXPIRED_ACTIVE_SQL, [now, 500]);
  t.diagnostic(`listExpiredActiveIds: ${summary(expired.Plan)}; ${expired['Execution Time']} ms`);
  assert.ok(indexesUsed(expired.Plan).includes('listings_search_idx'), summary(expired.Plan));
});
