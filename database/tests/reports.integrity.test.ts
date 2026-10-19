// Spec 006 (data-model.md §2 y §4): vistas de lectura v_user_cost_lines y v_group_collection
// (0100) e índices de reportes (0101). Las vistas leen las copias del ciclo y del cobro, nunca los
// valores actuales del grupo (RN-006-06), y excluyen los cobros cancelados (RN-006-07). Todos los
// datos son ficticios.
//
// Pruebas primero (T001): hasta que existan 0100 y 0101 este archivo falla por relaciones
// inexistentes.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';

// CA-006-19: la vista de una persona con 20 grupos y 12 meses responde en menos de 100 ms.
const VIEW_BUDGET_MS = 100;

let db: TempDatabase;
// Un pool compartido: abrir una conexión por consulta hace que el archivo tarde demasiado.
let pool: pg.Pool;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  pool = new pg.Pool({ connectionString: db.connectionString, max: 2 });
});

after(async () => {
  await pool?.end();
  await db?.drop();
});

type Row = Record<string, unknown>;

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

async function run<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

async function inTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
}

async function insertWith(client: pg.PoolClient, table: string, values: Row): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  const [row] = rows;
  assert.ok(row);
  return row.id;
}

async function insertRow(table: string, values: Row): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

// ---------------------------------------------------------------- usuarios y grupos

let sequence = 0;

function newUserId(): Promise<string> {
  sequence += 1;
  const n = sequence;
  const email = `reports${n}@example.com`;
  return insertRow('users', {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${5000000 + n}`),
    phone_e164: `+5917${String(n + 300).padStart(7, '0')}`,
    telegram_user_id: String(500000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  });
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let codeSequence = 0;

function nextInviteCode(): string {
  codeSequence += 1;
  let n = codeSequence + 31337;
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (CODE_ALPHABET[n % CODE_ALPHABET.length] ?? 'A') + code;
    n = Math.floor(n / CODE_ALPHABET.length);
  }
  return code;
}

interface CreatedGroup {
  id: string;
  ownerId: string;
}

// INSERT en groups y la fila del titular en group_members en una sola transacción.
async function createGroup(overrides: Row = {}): Promise<CreatedGroup> {
  const ownerId = await newUserId();
  return inTransaction(async (tx) => {
    const id = await insertWith(tx, 'groups', {
      owner_id: ownerId,
      name: 'Grupo de prueba',
      service_name_snapshot: 'Servicio personalizado',
      price_cents: 6000,
      currency: 'BS',
      billing_day: 5,
      total_slots: 5,
      invite_code: nextInviteCode(),
      ...overrides,
    });
    await insertWith(tx, 'group_members', {
      group_id: id,
      user_id: ownerId,
      role: 'titular',
      join_source: 'creacion',
    });
    return { id, ownerId };
  });
}

// Solicitud mínima ya cerrada para que group_members admita join_source = 'solicitud' (0055). Se
// inserta con session_replication_role = replica solo en esta transacción.
async function newJoinRequest(groupId: string, applicantId: string): Promise<string> {
  return inTransaction(async (tx) => {
    await tx.query("SET LOCAL session_replication_role = 'replica'");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO join_requests
         (group_id, applicant_id, opened_at, open_deadline_at, status, final_at, final_reason)
       VALUES ($1, $2, now(), now() + interval '24 hours', 'expirada', now(), 'plazo_solicitud')
       RETURNING id`,
      [groupId, applicantId],
    );
    const [row] = rows;
    assert.ok(row);
    return row.id;
  });
}

async function addMember(groupId: string, userId?: string): Promise<string> {
  const memberId = userId ?? (await newUserId());
  await insertRow('group_members', {
    group_id: groupId,
    user_id: memberId,
    role: 'miembro',
    join_source: 'solicitud',
    join_request_id: await newJoinRequest(groupId, memberId),
  });
  return memberId;
}

// ---------------------------------------------------------------- ciclos y cobros

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface Cycle {
  id: string;
  groupId: string;
  ownerId: string;
  values: Row;
}

// Ciclo regular que respeta los CHECK de 0040: base = floor(total / n), titular = base + resto.
async function createCycle(
  group: CreatedGroup,
  options: { cut?: string; total?: number; members?: number; ownerId?: string; rate?: string } = {},
): Promise<Cycle> {
  const cut = options.cut ?? '2025-03-05';
  const total = options.total ?? 6000;
  const members = options.members ?? 4;
  const base = Math.floor(total / members);
  const remainder = total - base * members;
  const issuedAt = `${cut}T12:00:00Z`;
  const ownerId = options.ownerId ?? group.ownerId;
  const values: Row = {
    group_id: group.id,
    owner_id: ownerId,
    period: cut.slice(0, 7),
    cycle_type: 'regular',
    cut_date: cut,
    due_date: addDays(cut, 3),
    issued_at: issuedAt,
    price_cents: options.rate ? 862 : total,
    currency: options.rate ? 'USD' : 'BS',
    exchange_rate: options.rate ?? null,
    total_bs_cents: total,
    member_count: members,
    base_share_cents: base,
    owner_share_cents: base + remainder,
    remainder_cents: remainder,
    finalized_at: issuedAt,
  };
  const id = await insertRow('billing_cycles', values);
  return { id, groupId: group.id, ownerId, values };
}

// Cobro de origen 'ciclo' con la copia exacta del ciclo.
function insertCharge(cycle: Cycle, userId: string): Promise<string> {
  const v = cycle.values;
  return insertRow('charges', {
    group_id: cycle.groupId,
    user_id: userId,
    cycle_id: cycle.id,
    period: v.period,
    origin: 'ciclo',
    amount_cents: v.base_share_cents,
    price_cents: v.price_cents,
    currency: v.currency,
    exchange_rate: v.exchange_rate,
    total_bs_cents: v.total_bs_cents,
    member_count: v.member_count,
    issued_at: v.issued_at,
    due_at: `${addDays(String(v.cut_date), 4)}T04:00:00Z`,
  });
}

async function payCharge(chargeId: string, ownerId: string): Promise<void> {
  await run(
    `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2, settlement = 'manual'
     WHERE id = $1`,
    [chargeId, ownerId],
  );
}

async function submitCharge(chargeId: string): Promise<void> {
  await run(`UPDATE charges SET status = 'en_revision', first_submitted_at = now() WHERE id = $1`, [
    chargeId,
  ]);
}

async function cancelCharge(chargeId: string, ownerId: string): Promise<void> {
  await run(
    `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                        cancel_reason = 'Motivo de prueba'
     WHERE id = $1`,
    [chargeId, ownerId],
  );
}

interface CostLine {
  user_id: string;
  role: string;
  charge_id: string | null;
  cost_cents: string;
  status: string | null;
  paid_cents: string | null;
  individual_price_bs_cents: string | null;
}

function costLines(where: string, params: unknown[]): Promise<(CostLine & Row)[]> {
  return run<CostLine & Row>(
    `SELECT user_id, role, charge_id, cost_cents::text AS cost_cents, status,
            paid_cents::text AS paid_cents,
            individual_price_bs_cents::text AS individual_price_bs_cents
     FROM v_user_cost_lines WHERE ${where}`,
    params,
  );
}

// Grupo con tres miembros y un ciclo de 4 personas, con un cobro por miembro.
async function groupWithCycle(
  groupOverrides: Row = {},
  cycleOptions: Parameters<typeof createCycle>[1] = {},
): Promise<{ group: CreatedGroup; cycle: Cycle; members: string[]; charges: string[] }> {
  const group = await createGroup(groupOverrides);
  const members = [await addMember(group.id), await addMember(group.id), await addMember(group.id)];
  const cycle = await createCycle(group, cycleOptions);
  const charges: string[] = [];
  for (const member of members) charges.push(await insertCharge(cycle, member));
  return { group, cycle, members, charges };
}

// ---------------------------------------------------------------- v_user_cost_lines

test('CA-006-03: el titular tiene una fila por ciclo con owner_share_cents y el miembro una por cobro', async () => {
  const { group, cycle, members } = await groupWithCycle({}, { total: 6001 });
  const owner = await costLines('cycle_id = $1 AND role = $2', [cycle.id, 'titular']);
  assert.equal(owner.length, 1);
  assert.equal(owner[0]?.user_id, group.ownerId);
  assert.equal(owner[0]?.cost_cents, '1501');
  assert.equal(owner[0]?.charge_id, null);
  assert.equal(owner[0]?.status, null);
  assert.equal(owner[0]?.paid_cents, null);

  const lines = await costLines('cycle_id = $1 AND role = $2', [cycle.id, 'miembro']);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => line.user_id).sort(), [...members].sort());
  for (const line of lines) {
    assert.equal(line.cost_cents, '1500');
    assert.equal(line.status, 'pendiente');
    assert.equal(line.paid_cents, '0');
  }
});

test('RN-006-02: paid_cents es cost_cents solo cuando el cobro está pagado', async () => {
  const { group, charges } = await groupWithCycle();
  const [paid, inReview] = charges;
  assert.ok(paid && inReview);
  await payCharge(paid, group.ownerId);
  await submitCharge(inReview);
  const [paidLine] = await costLines('charge_id = $1', [paid]);
  assert.equal(paidLine?.paid_cents, '1500');
  const [reviewLine] = await costLines('charge_id = $1', [inReview]);
  assert.equal(reviewLine?.status, 'en_revision');
  assert.equal(reviewLine?.paid_cents, '0');
});

test('CA-006-02: un cobro cancelado no aparece en v_user_cost_lines', async () => {
  const { group, charges } = await groupWithCycle();
  const [cancelled] = charges;
  assert.ok(cancelled);
  await cancelCharge(cancelled, group.ownerId);
  assert.equal((await costLines('charge_id = $1', [cancelled])).length, 0);
});

test('CA-006-22, RNF-006-06: Σ cost_cents por grupo y período = total_bs_cents del ciclo', async () => {
  const { group, cycle } = await groupWithCycle({}, { total: 6003 });
  const [row] = await run<{ sum: string; kind: string }>(
    `SELECT sum(cost_cents)::text AS sum, pg_typeof(sum(cost_cents))::text AS kind
     FROM v_user_cost_lines WHERE group_id = $1 AND period = $2`,
    [group.id, cycle.values.period],
  );
  assert.equal(row?.sum, '6003');
  assert.equal(row?.kind, 'numeric');
  const [types] = await run<{ cost: string; paid: string; indiv: string }>(
    `SELECT pg_typeof(cost_cents)::text AS cost, pg_typeof(paid_cents)::text AS paid,
            pg_typeof(individual_price_bs_cents)::text AS indiv
     FROM v_user_cost_lines WHERE group_id = $1 LIMIT 1`,
    [group.id],
  );
  assert.deepEqual(types, { cost: 'bigint', paid: 'bigint', indiv: 'bigint' });
});

test('CA-006-04: precio individual de 1000 USD con tipo de cambio 6,96 → 6960 Bs', async () => {
  const { cycle } = await groupWithCycle(
    {
      currency: 'USD',
      price_cents: 862,
      exchange_rate: '6.9600',
      individual_price_cents_snapshot: 1000,
      individual_price_currency_snapshot: 'USD',
    },
    { total: 6000, rate: '6.9600' },
  );
  const lines = await costLines('cycle_id = $1', [cycle.id]);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.equal(line.individual_price_bs_cents, '6960');
});

test('CA-006-04: precio individual en Bs se usa tal cual', async () => {
  const { cycle } = await groupWithCycle({
    individual_price_cents_snapshot: 4590,
    individual_price_currency_snapshot: 'BS',
  });
  const lines = await costLines('cycle_id = $1', [cycle.id]);
  for (const line of lines) assert.equal(line.individual_price_bs_cents, '4590');
});

test('CA-006-05: sin precio individual, o en USD con un ciclo sin tipo de cambio → NULL', async () => {
  const absent = await groupWithCycle();
  for (const line of await costLines('cycle_id = $1', [absent.cycle.id])) {
    assert.equal(line.individual_price_bs_cents, null);
  }
  const usdWithoutRate = await groupWithCycle({
    individual_price_cents_snapshot: 1000,
    individual_price_currency_snapshot: 'USD',
  });
  for (const line of await costLines('cycle_id = $1', [usdWithoutRate.cycle.id])) {
    assert.equal(line.individual_price_bs_cents, null);
  }
});

test('CA-006-10: cambiar el tipo de cambio del grupo no cambia los meses anteriores', async () => {
  const { group, cycle } = await groupWithCycle(
    {
      currency: 'USD',
      price_cents: 862,
      exchange_rate: '6.9600',
      individual_price_cents_snapshot: 1000,
      individual_price_currency_snapshot: 'USD',
    },
    { total: 6000, rate: '6.9600' },
  );
  const before = await costLines('cycle_id = $1 ORDER BY role, user_id', [cycle.id]);
  await run(`UPDATE groups SET exchange_rate = 7.5000 WHERE id = $1`, [group.id]);
  const afterChange = await costLines('cycle_id = $1 ORDER BY role, user_id', [cycle.id]);
  assert.deepEqual(afterChange, before);
});

test('CA-006-03: con la titularidad transferida, los ciclos anteriores siguen del titular de entonces', async () => {
  const group = await createGroup();
  const newOwnerId = await addMember(group.id);
  const first = await createCycle(group, { cut: '2025-03-05', members: 2 });
  await insertCharge(first, newOwnerId);
  await inTransaction(async (tx) => {
    await tx.query(
      `UPDATE group_members SET role = 'miembro'
       WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.id, group.ownerId],
    );
    await tx.query(
      `UPDATE group_members SET role = 'titular'
       WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.id, newOwnerId],
    );
    await tx.query('UPDATE groups SET owner_id = $2 WHERE id = $1', [group.id, newOwnerId]);
  });
  const second = await createCycle(group, { cut: '2025-04-05', members: 2, ownerId: newOwnerId });
  await insertCharge(second, group.ownerId);

  const [march] = await costLines('cycle_id = $1 AND role = $2', [first.id, 'titular']);
  assert.equal(march?.user_id, group.ownerId);
  const [april] = await costLines('cycle_id = $1 AND role = $2', [second.id, 'titular']);
  assert.equal(april?.user_id, newOwnerId);
});

// ---------------------------------------------------------------- v_group_collection

interface Collection {
  owner_id: string;
  expected_cents: string;
  collected_cents: string;
  in_review_cents: string;
  pending_cents: string;
  charge_count: number;
  paid_count: number;
}

async function collection(groupId: string, period: unknown): Promise<Collection | undefined> {
  const [row] = await run<Collection & Row>(
    `SELECT owner_id, expected_cents::text AS expected_cents,
            collected_cents::text AS collected_cents, in_review_cents::text AS in_review_cents,
            pending_cents::text AS pending_cents, charge_count, paid_count
     FROM v_group_collection WHERE group_id = $1 AND period = $2`,
    [groupId, period],
  );
  return row;
}

test('RF-006-06: v_group_collection suma esperado, cobrado, en revisión y pendiente', async () => {
  const { group, cycle, charges } = await groupWithCycle();
  const [paid, inReview] = charges;
  assert.ok(paid && inReview);
  await payCharge(paid, group.ownerId);
  await submitCharge(inReview);
  assert.deepEqual(await collection(group.id, cycle.values.period), {
    owner_id: group.ownerId,
    expected_cents: '4500',
    collected_cents: '1500',
    in_review_cents: '1500',
    pending_cents: '3000',
    charge_count: 3,
    paid_count: 1,
  });
});

test('CA-006-02: un cobro cancelado no suma en v_group_collection', async () => {
  const { group, cycle, charges } = await groupWithCycle();
  const [cancelled] = charges;
  assert.ok(cancelled);
  await cancelCharge(cancelled, group.ownerId);
  const row = await collection(group.id, cycle.values.period);
  assert.equal(row?.expected_cents, '3000');
  assert.equal(row?.charge_count, 2);
});

// ---------------------------------------------------------------- índices y rendimiento

async function indexdef(name: string): Promise<string> {
  const [index] = await run<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
    [name],
  );
  assert.ok(index, `falta ${name}`);
  return index.indexdef;
}

test('RNF-006-01: charges_user_period_idx indexa (user_id, period) sin cancelados', async () => {
  const def = await indexdef('charges_user_period_idx');
  assert.ok(
    def.endsWith(
      "ON public.charges USING btree (user_id, period) WHERE (status <> 'cancelado'::text)",
    ),
    def,
  );
});

test('RNF-006-01: billing_cycles_owner_period_idx indexa (owner_id, period)', async () => {
  const def = await indexdef('billing_cycles_owner_period_idx');
  assert.ok(def.endsWith('ON public.billing_cycles USING btree (owner_id, period)'), def);
});

test('CA-006-19, RNF-006-06: 20 grupos × 12 meses de una persona responden en menos de 100 ms', async () => {
  const memberId = await newUserId();
  for (let g = 0; g < 20; g += 1) {
    const group = await createGroup();
    await addMember(group.id, memberId);
    for (let month = 1; month <= 12; month += 1) {
      const cut = `2024-${String(month).padStart(2, '0')}-05`;
      const cycle = await createCycle(group, { cut, members: 2 });
      await insertCharge(cycle, memberId);
    }
  }
  await run('ANALYZE charges, billing_cycles, groups');

  const [result] = await run<{ 'QUERY PLAN': { 'Execution Time': number }[] }>(
    `EXPLAIN (ANALYZE, FORMAT JSON)
     SELECT period, sum(cost_cents) AS spent
     FROM v_user_cost_lines
     WHERE user_id = $1 AND period BETWEEN '2024-01' AND '2024-12'
     GROUP BY period`,
    [memberId],
  );
  const time = result?.['QUERY PLAN'][0]?.['Execution Time'];
  assert.ok(typeof time === 'number' && time < VIEW_BUDGET_MS, `tardó ${String(time)} ms`);
  const lines = await costLines('user_id = $1', [memberId]);
  assert.equal(lines.length, 240);
});
