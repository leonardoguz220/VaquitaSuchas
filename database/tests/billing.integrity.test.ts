// Spec 002 (data-model.md §1 y §4, con los ajustes H1-H4, M1 y M2): integridad de billing_cycles
// (0040), charges (0041), receipts y payment_references (0042), los disparadores de charges (0043)
// y charge_events (0044). Cada restricción se prueba intentando violarla. Todos los datos son
// ficticios: usuarios de prueba con hash y CI arbitrarios y grupos con precio inventado.
//
// Un grupo se crea con INSERT en groups y la fila del titular en group_members en una sola
// transacción (disparador diferido groups_owner_member_consistency de la spec 001).
// Los CHECK y los índices únicos se comprueban por código (23514, 23505, 23503, 23502); los
// disparadores pueden responder 23514 o 23001, y en ese caso además se verifica el efecto.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';
const RESTRICT_VIOLATION = '23001';
const TRIGGER_CODES = [CHECK_VIOLATION, RESTRICT_VIOLATION];

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const FIVE_MB = 5242880;

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

interface PgError {
  code?: string;
  constraint?: string;
}

type Row = Record<string, unknown>;

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

function run<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return queryRows<T>(db.connectionString, sql, params);
}

async function rejectsWith(
  promise: Promise<unknown>,
  expected: { code: string; constraint?: string },
): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.equal(error.code, expected.code);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    return true;
  });
}

// Disparadores (RAISE EXCEPTION): 23514 o 23001. Quien llama verifica además el efecto.
async function rejectsByTrigger(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.ok(
      TRIGGER_CODES.includes(error.code ?? ''),
      `se esperaba 23514 o 23001 y llegó ${String(error.code)}`,
    );
    return true;
  });
}

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  return client;
}

async function inTransaction<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = await connect();
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
    await client.end();
  }
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

async function insertWith(client: pg.Client, table: string, values: Row): Promise<string> {
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

async function count(table: string, where: string, params: unknown[]): Promise<number> {
  const [row] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return row?.n ?? -1;
}

// ---------------------------------------------------------------- usuarios ficticios

let sequence = 0;

function defaultUser(): Row {
  sequence += 1;
  const n = sequence;
  const email = `billing${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${2000000 + n}`),
    phone_e164: `+5917${String(n).padStart(7, '0')}`,
    telegram_user_id: String(800000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  };
}

function newUserId(): Promise<string> {
  return insertRow('users', defaultUser());
}

// ---------------------------------------------------------------- grupos

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let codeSequence = 0;

function nextInviteCode(): string {
  codeSequence += 1;
  let n = codeSequence + 7919;
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

// Crea un grupo válido: INSERT en groups y la fila del titular en group_members en una sola
// transacción, como exige el disparador diferido groups_owner_member_consistency.
async function createGroup(): Promise<CreatedGroup> {
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

async function addMember(groupId: string): Promise<string> {
  const userId = await newUserId();
  await insertRow('group_members', {
    group_id: groupId,
    user_id: userId,
    role: 'miembro',
    join_source: 'solicitud',
  });
  return userId;
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

// Valores de un ciclo que respetan todos los CHECK: period = mes del corte, due_date = corte + 3,
// base = floor(total / n), resto = total - base * n, titular = base + resto. Los overrides de
// cut_date, total_bs_cents, member_count, currency y cycle_type recalculan lo derivado; los
// demás overrides reemplazan el valor tal cual (para violar una restricción a propósito).
function cycleValues(groupId: string, ownerId: string, overrides: Row): Row {
  const cut = typeof overrides.cut_date === 'string' ? overrides.cut_date : '2025-03-05';
  const total = Number(overrides.total_bs_cents ?? 6000);
  const members = Number(overrides.member_count ?? 4);
  const base = Math.floor(total / members);
  const remainder = total - base * members;
  const currency = overrides.currency ?? 'BS';
  const issuedAt = `${cut}T12:00:00Z`;
  return {
    group_id: groupId,
    owner_id: ownerId,
    period: cut.slice(0, 7),
    cycle_type: 'regular',
    cut_date: cut,
    due_date: addDays(cut, 3),
    issued_at: issuedAt,
    price_cents: currency === 'USD' ? 862 : total,
    currency,
    exchange_rate: currency === 'USD' ? '6.9600' : null,
    total_bs_cents: total,
    member_count: members,
    base_share_cents: base,
    owner_share_cents: base + remainder,
    remainder_cents: remainder,
    finalized_at: overrides.cycle_type === 'inicial' ? null : issuedAt,
    ...overrides,
  };
}

async function createCycle(group: CreatedGroup, overrides: Row = {}): Promise<Cycle> {
  const values = cycleValues(group.id, group.ownerId, overrides);
  const id = await insertRow('billing_cycles', values);
  return { id, groupId: group.id, ownerId: group.ownerId, values };
}

function cycleInsert(group: CreatedGroup, overrides: Row): Promise<string> {
  return insertRow('billing_cycles', cycleValues(group.id, group.ownerId, overrides));
}

// Cobro de origen 'ciclo' para un miembro: copia exacta del ciclo y amount = base (H3).
function chargeValues(cycle: Cycle, userId: string, overrides: Row = {}): Row {
  const v = cycle.values;
  const cut = String(v.cut_date);
  return {
    group_id: cycle.groupId,
    user_id: userId,
    cycle_id: cycle.id,
    period: v.period,
    origin: 'ciclo',
    status: 'pendiente',
    amount_cents: v.base_share_cents,
    price_cents: v.price_cents,
    currency: v.currency,
    exchange_rate: v.exchange_rate,
    total_bs_cents: v.total_bs_cents,
    member_count: v.member_count,
    issued_at: v.issued_at,
    // Instante exclusivo: inicio del día corte + 4 en La Paz (UTC-4).
    due_at: `${addDays(cut, 4)}T04:00:00Z`,
    ...overrides,
  };
}

function insertCharge(cycle: Cycle, userId: string, overrides: Row = {}): Promise<string> {
  return insertRow('charges', chargeValues(cycle, userId, overrides));
}

// Cobro de origen 'ingreso' (spec 010): nace pagado y se liquida como ingreso.
function entryChargeValues(cycle: Cycle, userId: string, overrides: Row = {}): Row {
  const members = Number(cycle.values.member_count) + 1;
  return chargeValues(cycle, userId, {
    origin: 'ingreso',
    join_request_id: randomUUID(),
    status: 'pagado',
    amount_cents: Math.floor(Number(cycle.values.total_bs_cents) / members),
    member_count: members,
    paid_at: cycle.values.issued_at,
    settled_by: cycle.ownerId,
    settlement: 'ingreso',
    ...overrides,
  });
}

interface ChargeState {
  status: string;
  version: number;
  amount_cents: string;
  exchange_rate: string | null;
  period: string;
  first_submitted_at: Date | null;
  manual_note: string | null;
  cancel_reason: string | null;
}

async function chargeState(id: string): Promise<ChargeState> {
  const [row] = await run<ChargeState & Row>(
    `SELECT status, version, amount_cents::text AS amount_cents,
            exchange_rate::text AS exchange_rate, period, first_submitted_at, manual_note,
            cancel_reason
     FROM charges WHERE id = $1`,
    [id],
  );
  assert.ok(row);
  return row;
}

// ---------------------------------------------------------------- transiciones (RN-002-01)

const STATUSES = ['pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado'] as const;
type Status = (typeof STATUSES)[number];

// Copia de la tabla de spec.md RN-002-01 (sin las filas «(nuevo)», que cubre charges_initial_status):
//   pendiente   -> en_revision   Miembro  sube comprobante
//   atrasado    -> en_revision   Miembro  sube comprobante
//   pendiente   -> atrasado      Sistema  pasa la fecha de vencimiento
//   en_revision -> pagado        Titular  confirma
//   en_revision -> pendiente     Titular  rechaza, vigente
//   en_revision -> atrasado      Titular  rechaza, ya vencido
//   pendiente / atrasado -> pagado     Titular  pago manual
//   pendiente / atrasado -> cancelado  Titular  cancela con motivo
// pagado y cancelado son finales. Cualquier otra transición es inválida.
const VALID_TRANSITIONS: ReadonlySet<string> = new Set([
  'pendiente>en_revision',
  'atrasado>en_revision',
  'pendiente>atrasado',
  'en_revision>pagado',
  'en_revision>pendiente',
  'en_revision>atrasado',
  'pendiente>pagado',
  'atrasado>pagado',
  'pendiente>cancelado',
  'atrasado>cancelado',
]);

// UPDATE que lleva un cobro a `to` completando las columnas que exigen los CHECK de coherencia.
function updateToStatus(chargeId: string, ownerId: string, to: Status): Promise<unknown> {
  switch (to) {
    case 'pendiente':
    case 'atrasado':
      return run(`UPDATE charges SET status = $2 WHERE id = $1`, [chargeId, to]);
    case 'en_revision':
      return run(
        `UPDATE charges SET status = 'en_revision',
                            first_submitted_at = COALESCE(first_submitted_at, now())
         WHERE id = $1`,
        [chargeId],
      );
    case 'pagado':
      return run(
        `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
                            settlement = CASE WHEN status = 'en_revision' THEN 'comprobante'
                                              ELSE 'manual' END
         WHERE id = $1`,
        [chargeId, ownerId],
      );
    case 'cancelado':
      return run(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                            cancel_reason = 'Motivo de prueba'
         WHERE id = $1`,
        [chargeId, ownerId],
      );
  }
}

// Lleva un cobro recién creado (pendiente) al estado de partida por un camino válido.
async function reachStatus(chargeId: string, ownerId: string, from: Status): Promise<void> {
  if (from === 'pendiente') return;
  await updateToStatus(chargeId, ownerId, from);
  assert.equal((await chargeState(chargeId)).status, from);
}

async function pendingCharge(cycleOverrides: Row = {}): Promise<{
  group: CreatedGroup;
  cycle: Cycle;
  memberId: string;
  chargeId: string;
}> {
  const group = await createGroup();
  const memberId = await addMember(group.id);
  const cycle = await createCycle(group, cycleOverrides);
  const chargeId = await insertCharge(cycle, memberId);
  return { group, cycle, memberId, chargeId };
}

// ================================================================ billing_cycles

describe('billing_cycles (0040)', () => {
  test('RF-002-04: dos ciclos del mismo grupo y período fallan', async () => {
    const group = await createGroup();
    await createCycle(group);
    await rejectsWith(cycleInsert(group, {}), { code: UNIQUE_VIOLATION });
    assert.equal(await count('billing_cycles', 'group_id = $1', [group.id]), 1);
  });

  test('RF-002-04: dos ciclos inicial del mismo grupo fallan (billing_cycles_initial_uq)', async () => {
    const group = await createGroup();
    await createCycle(group, { cycle_type: 'inicial', cut_date: '2025-03-05' });
    await rejectsWith(cycleInsert(group, { cycle_type: 'inicial', cut_date: '2025-04-05' }), {
      code: UNIQUE_VIOLATION,
      constraint: 'billing_cycles_initial_uq',
    });
  });

  test('RN-002-09: un ciclo regular exige finalized_at', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { finalized_at: null }), { code: CHECK_VIOLATION });
  });

  test('RN-001-02: cuotas que no suman el total fallan', async () => {
    const group = await createGroup();
    // 1500 * 3 + 1600 = 6100 <> 6000 (owner - base = remainder sí se cumple).
    await rejectsWith(
      cycleInsert(group, { base_share_cents: 1500, owner_share_cents: 1600, remainder_cents: 100 }),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-001-02: owner_share - base_share distinto del resto falla', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { remainder_cents: 1 }), { code: CHECK_VIOLATION });
  });

  test('RN-001-02 (H4): base distinta de floor con resto >= miembros falla', async () => {
    const group = await createGroup();
    // 1400 * 3 + 1800 = 6000 y 1800 - 1400 = 400, pero 400 >= 4 miembros.
    await rejectsWith(
      cycleInsert(group, { base_share_cents: 1400, owner_share_cents: 1800, remainder_cents: 400 }),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-001-02 (H4): base negativa falla', async () => {
    const group = await createGroup();
    // -100 * 3 + 6300 = 6000 y 6300 - (-100) = 6400.
    await rejectsWith(
      cycleInsert(group, {
        base_share_cents: -100,
        owner_share_cents: 6300,
        remainder_cents: 6400,
      }),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-001-02: resto no exacto asignado al titular se acepta (floor)', async () => {
    const group = await createGroup();
    // 6001 / 4 -> base 1500, resto 1, titular 1501.
    const cycle = await createCycle(group, { total_bs_cents: 6001 });
    assert.equal(cycle.values.owner_share_cents, 1501);
  });

  test('RF-002-03 (M2): period distinto del mes del corte falla', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { cut_date: '2025-03-05', period: '2025-04' }), {
      code: CHECK_VIOLATION,
    });
  });

  test('RF-002-03: period con formato inválido falla', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { period: '2025-13' }), { code: CHECK_VIOLATION });
  });

  test('RF-002-03 (M2): due_date distinto de corte + 3 falla', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { cut_date: '2025-03-05', due_date: '2025-03-09' }), {
      code: CHECK_VIOLATION,
    });
  });

  test('RF-002-03: corte a fin de mes con due_date en el mes siguiente se acepta', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group, { cut_date: '2025-02-28' });
    assert.equal(cycle.values.due_date, '2025-03-03');
    assert.equal(cycle.values.period, '2025-02');
  });

  test('constitución II: copia del ciclo con moneda inválida o tipo de cambio incoherente falla', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { currency: 'EUR', exchange_rate: null }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(cycleInsert(group, { currency: 'USD', exchange_rate: null }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(cycleInsert(group, { currency: 'BS', exchange_rate: '6.9600' }), {
      code: CHECK_VIOLATION,
    });
  });

  test('RN-002-09: precio, total y miembros fuera de rango fallan', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { price_cents: 0 }), { code: CHECK_VIOLATION });
    await rejectsWith(
      cycleInsert(group, {
        total_bs_cents: 0,
        base_share_cents: 0,
        owner_share_cents: 0,
        remainder_cents: 0,
      }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      cycleInsert(group, {
        member_count: 0,
        base_share_cents: 0,
        owner_share_cents: 6000,
        remainder_cents: 6000,
      }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(cycleInsert(group, { cycle_type: 'extra' }), { code: CHECK_VIOLATION });
  });

  test('RN-002-09: group_id y owner_id inexistentes fallan por FK; period nulo por NOT NULL', async () => {
    const group = await createGroup();
    await rejectsWith(cycleInsert(group, { group_id: MISSING_ID }), { code: FK_VIOLATION });
    await rejectsWith(cycleInsert(group, { owner_id: MISSING_ID }), { code: FK_VIOLATION });
    await rejectsWith(cycleInsert(group, { period: null }), { code: NOT_NULL_VIOLATION });
  });

  test('RN-002-09: un ciclo regular no se puede modificar', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group);
    await rejectsByTrigger(
      run(
        `UPDATE billing_cycles SET member_count = 5, base_share_cents = 1200,
                                   owner_share_cents = 1200, remainder_cents = 0
         WHERE id = $1`,
        [cycle.id],
      ),
    );
    await rejectsByTrigger(
      run(`UPDATE billing_cycles SET issued_at = issued_at + interval '1 minute' WHERE id = $1`, [
        cycle.id,
      ]),
    );
    await rejectsByTrigger(
      run(`UPDATE billing_cycles SET finalized_at = now() WHERE id = $1`, [cycle.id]),
    );
    const [row] = await run<{ member_count: number }>(
      'SELECT member_count FROM billing_cycles WHERE id = $1',
      [cycle.id],
    );
    assert.equal(row?.member_count, 4);
  });

  test('RN-002-09: el ciclo inicial sin finalizar admite recalcular miembros y cuotas y luego cerrarse', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group, { cycle_type: 'inicial' });
    await run(
      `UPDATE billing_cycles SET member_count = 5, base_share_cents = 1200,
                                 owner_share_cents = 1200, remainder_cents = 0
       WHERE id = $1`,
      [cycle.id],
    );
    await run(`UPDATE billing_cycles SET finalized_at = now() WHERE id = $1`, [cycle.id]);
    const [row] = await run<{ member_count: number; closed: boolean }>(
      'SELECT member_count, finalized_at IS NOT NULL AS closed FROM billing_cycles WHERE id = $1',
      [cycle.id],
    );
    assert.equal(row?.member_count, 5);
    assert.equal(row?.closed, true);
  });

  test('RN-002-09: el ciclo inicial sin finalizar no admite cambiar precio ni período', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group, { cycle_type: 'inicial' });
    await rejectsByTrigger(
      run(
        `UPDATE billing_cycles SET price_cents = 7000, total_bs_cents = 7000,
                                   base_share_cents = 1750, owner_share_cents = 1750
         WHERE id = $1`,
        [cycle.id],
      ),
    );
    await rejectsByTrigger(
      run(
        `UPDATE billing_cycles SET period = '2025-04', cut_date = '2025-04-05',
                                   due_date = '2025-04-08'
         WHERE id = $1`,
        [cycle.id],
      ),
    );
    const [row] = await run<{ price: string; period: string }>(
      'SELECT price_cents::text AS price, period FROM billing_cycles WHERE id = $1',
      [cycle.id],
    );
    assert.equal(row?.price, '6000');
    assert.equal(row?.period, '2025-03');
  });

  test('RN-002-09: el ciclo inicial ya finalizado no se puede modificar', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group, { cycle_type: 'inicial' });
    await run(`UPDATE billing_cycles SET finalized_at = now() WHERE id = $1`, [cycle.id]);
    await rejectsByTrigger(
      run(
        `UPDATE billing_cycles SET member_count = 5, base_share_cents = 1200,
                                   owner_share_cents = 1200, remainder_cents = 0
         WHERE id = $1`,
        [cycle.id],
      ),
    );
    const [row] = await run<{ member_count: number }>(
      'SELECT member_count FROM billing_cycles WHERE id = $1',
      [cycle.id],
    );
    assert.equal(row?.member_count, 4);
  });
});

// ================================================================ charges

describe('charges (0041) y sus disparadores (0043)', () => {
  test('CA-002-02 / RF-002-04: un cobro duplicado del mismo miembro y período falla', async () => {
    const { cycle, memberId } = await pendingCharge();
    await rejectsWith(insertCharge(cycle, memberId), {
      code: UNIQUE_VIOLATION,
      constraint: 'charges_member_period_uq',
    });
  });

  test('CA-002-02 / RF-002-04: con el cobro anterior cancelado, el nuevo se acepta', async () => {
    const { group, cycle, memberId, chargeId } = await pendingCharge();
    await updateToStatus(chargeId, group.ownerId, 'cancelado');
    await insertCharge(cycle, memberId);
    assert.equal(await count('charges', 'group_id = $1 AND user_id = $2', [group.id, memberId]), 2);
  });

  test('RN-002-03: un cobro para el titular del grupo falla (charges_not_owner)', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group);
    await rejectsByTrigger(insertCharge(cycle, group.ownerId));
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
  });

  test('RN-002-10: origin fuera de los valores o ingreso sin join_request_id fallan', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    // Puede rechazarlo charges_initial_status antes que el CHECK: se acepta 23514 o 23001.
    await rejectsByTrigger(insertCharge(cycle, memberId, { origin: 'extra' }));
    await rejectsWith(insertCharge(cycle, memberId, { join_request_id: randomUUID() }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(
      insertRow('charges', entryChargeValues(cycle, memberId, { join_request_id: null })),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-002-01: status fuera de los cinco estados falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    // Puede rechazarlo charges_initial_status antes que el CHECK: se acepta 23514 o 23001.
    await rejectsByTrigger(insertCharge(cycle, memberId, { status: 'perdido' }));
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
  });

  test('RN-002-02: amount_cents <= 0 falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    await rejectsWith(
      insertRow('charges', entryChargeValues(cycle, memberId, { amount_cents: 0 })),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-002-01 / RN-002-10 (H2): un cobro ciclo que no nace pendiente falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    await rejectsByTrigger(
      insertCharge(cycle, memberId, { status: 'en_revision', first_submitted_at: new Date() }),
    );
    await rejectsByTrigger(insertCharge(cycle, memberId, { status: 'atrasado' }));
    await rejectsByTrigger(
      insertCharge(cycle, memberId, {
        status: 'pagado',
        paid_at: cycle.values.issued_at,
        settled_by: group.ownerId,
        settlement: 'manual',
      }),
    );
    await rejectsByTrigger(
      insertCharge(cycle, memberId, {
        status: 'cancelado',
        cancelled_at: new Date(),
        cancelled_by: group.ownerId,
        cancel_reason: 'Motivo de prueba',
      }),
    );
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
  });

  test('RN-002-01 / RN-002-10 (H2): un cobro ingreso que no nace pagado falla; pagado se acepta', async () => {
    const group = await createGroup();
    const cycle = await createCycle(group);
    const pendingMember = await addMember(group.id);
    await rejectsByTrigger(
      insertRow(
        'charges',
        entryChargeValues(cycle, pendingMember, {
          status: 'pendiente',
          paid_at: null,
          settled_by: null,
          settlement: null,
        }),
      ),
    );
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
    const id = await insertRow('charges', entryChargeValues(cycle, pendingMember));
    assert.equal((await chargeState(id)).status, 'pagado');
  });

  test('RN-002-10 (H2): settlement ingreso en un cobro ciclo falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
                            settlement = 'ingreso'
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
    assert.equal((await chargeState(chargeId)).status, 'pendiente');
  });

  test('RN-002-10 (H2): un cobro ingreso con settlement distinto de ingreso falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    await rejectsWith(
      insertRow('charges', entryChargeValues(cycle, memberId, { settlement: 'manual' })),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow(
        'charges',
        entryChargeValues(cycle, memberId, {
          settlement: 'comprobante',
          first_submitted_at: cycle.values.issued_at,
        }),
      ),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow('charges', entryChargeValues(cycle, memberId, { settlement: 'otro' })),
      { code: CHECK_VIOLATION },
    );
  });

  test('constitución II (H3): un cobro ciclo con copia o monto distintos de su ciclo falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const bsCycle = await createCycle(group, { cut_date: '2025-03-05' });
    const usdCycle = await createCycle(group, { cut_date: '2025-04-05', currency: 'USD' });
    const variants: { cycle: Cycle; overrides: Row }[] = [
      { cycle: bsCycle, overrides: { price_cents: 6001 } },
      { cycle: bsCycle, overrides: { currency: 'USD', exchange_rate: '6.9600' } },
      { cycle: usdCycle, overrides: { exchange_rate: '7.0000' } },
      { cycle: bsCycle, overrides: { total_bs_cents: 6001 } },
      { cycle: bsCycle, overrides: { member_count: 5 } },
      { cycle: bsCycle, overrides: { amount_cents: 1501 } },
    ];
    for (const { cycle, overrides } of variants) {
      await rejectsByTrigger(insertCharge(cycle, memberId, overrides));
    }
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
  });

  test('constitución II: un cobro con ciclo de otro grupo o de otro período falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const other = await createGroup();
    const otherCycle = await createCycle(other);
    await rejectsByTrigger(insertCharge(otherCycle, memberId, { group_id: group.id }));
    const cycle = await createCycle(group);
    await rejectsByTrigger(insertCharge(cycle, memberId, { period: '2025-04' }));
    assert.equal(await count('charges', 'group_id = $1', [group.id]), 0);
  });

  test('constitución II (H3): copia con moneda inválida o tipo de cambio incoherente falla', async () => {
    const group = await createGroup();
    const memberId = await addMember(group.id);
    const cycle = await createCycle(group);
    // Cobros de ingreso: charges_cycle_consistency no compara su copia, así que actúa el CHECK.
    const bad: Row[] = [
      { currency: 'EUR', exchange_rate: null },
      { currency: 'USD', exchange_rate: null },
      { currency: 'BS', exchange_rate: '6.9600' },
      { currency: 'USD', exchange_rate: '0' },
      { price_cents: 0 },
      { total_bs_cents: 0 },
      { member_count: 0 },
    ];
    for (const overrides of bad) {
      await rejectsWith(insertRow('charges', entryChargeValues(cycle, memberId, overrides)), {
        code: CHECK_VIOLATION,
      });
    }
  });

  test('RN-002-02 / CA-002-16: cambiar monto, tipo de cambio, período u otra columna de copia falla', async () => {
    const { chargeId } = await pendingCharge({ currency: 'USD' });
    const before = await chargeState(chargeId);
    const updates = [
      'amount_cents = amount_cents + 1',
      `exchange_rate = 7.1000`,
      `period = '2025-04'`,
      'price_cents = price_cents + 1',
      'total_bs_cents = total_bs_cents + 1',
      'member_count = member_count + 1',
      `issued_at = issued_at + interval '1 minute'`,
      `due_at = due_at + interval '1 day'`,
      `origin = 'ingreso', join_request_id = gen_random_uuid()`,
      'user_id = (SELECT owner_id FROM groups WHERE groups.id = charges.group_id)',
    ];
    for (const set of updates) {
      await rejectsByTrigger(run(`UPDATE charges SET ${set} WHERE id = $1`, [chargeId]));
    }
    const afterState = await chargeState(chargeId);
    assert.equal(afterState.amount_cents, before.amount_cents);
    assert.equal(afterState.exchange_rate, before.exchange_rate);
    assert.equal(afterState.period, before.period);
    assert.equal(afterState.version, before.version);
  });

  test('RNF-002-04: pagado sin paid_at, settled_by o settlement falla', async () => {
    const { group, chargeId } = await pendingCharge();
    const missing = [
      `paid_at = NULL, settled_by = $2, settlement = 'manual'`,
      `paid_at = now(), settled_by = NULL, settlement = 'manual'`,
      `paid_at = now(), settled_by = $2, settlement = NULL`,
    ];
    for (const set of missing) {
      await rejectsWith(
        run(`UPDATE charges SET status = 'pagado', ${set} WHERE id = $1 AND $2::uuid IS NOT NULL`, [
          chargeId,
          group.ownerId,
        ]),
        { code: CHECK_VIOLATION },
      );
    }
    assert.equal((await chargeState(chargeId)).status, 'pendiente');
  });

  test('RNF-002-04: datos de pago en un cobro no pagado fallan', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET paid_at = now(), settled_by = $2, settlement = 'manual' WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
  });

  test('RNF-002-04: cancelado sin motivo, o con motivo de menos de 5 caracteres, falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2,
                            cancel_reason = '  abc  '
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
    assert.equal((await chargeState(chargeId)).status, 'pendiente');
  });

  test('RN-002-08: settlement comprobante sin first_submitted_at falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
                            settlement = 'comprobante'
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-002-08: un pago manual anterior a la emisión falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'pagado', paid_at = issued_at - interval '1 day',
                            settled_by = $2, settlement = 'manual'
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-002-01: manual_note de más de 200 caracteres falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await rejectsWith(
      run(
        `UPDATE charges SET status = 'pagado', paid_at = now(), settled_by = $2,
                            settlement = 'manual', manual_note = repeat('x', 201)
         WHERE id = $1`,
        [chargeId, group.ownerId],
      ),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-002-01 / RNF-002-04 (M1): cualquier UPDATE a un cobro pagado falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await updateToStatus(chargeId, group.ownerId, 'pagado');
    const before = await chargeState(chargeId);
    await rejectsByTrigger(
      run(`UPDATE charges SET manual_note = 'Nota nueva' WHERE id = $1`, [chargeId]),
    );
    await rejectsByTrigger(
      run(`UPDATE charges SET paid_at = paid_at + interval '1 minute' WHERE id = $1`, [chargeId]),
    );
    await rejectsByTrigger(
      run(`UPDATE charges SET version = version + 1 WHERE id = $1`, [chargeId]),
    );
    const afterState = await chargeState(chargeId);
    assert.equal(afterState.manual_note, before.manual_note);
    assert.equal(afterState.version, before.version);
  });

  test('RN-002-01 / RNF-002-04 (M1): cualquier UPDATE a un cobro cancelado falla', async () => {
    const { group, chargeId } = await pendingCharge();
    await updateToStatus(chargeId, group.ownerId, 'cancelado');
    const before = await chargeState(chargeId);
    await rejectsByTrigger(
      run(`UPDATE charges SET cancel_reason = 'Otro motivo distinto' WHERE id = $1`, [chargeId]),
    );
    await rejectsByTrigger(
      run(`UPDATE charges SET first_submitted_at = now() WHERE id = $1`, [chargeId]),
    );
    const afterState = await chargeState(chargeId);
    assert.equal(afterState.cancel_reason, before.cancel_reason);
    assert.equal(afterState.first_submitted_at, null);
    assert.equal(afterState.version, before.version);
  });

  test('RN-002-08 (M1): first_submitted_at no cambia una vez fijado', async () => {
    const { group, chargeId } = await pendingCharge();
    await updateToStatus(chargeId, group.ownerId, 'en_revision');
    const first = (await chargeState(chargeId)).first_submitted_at;
    assert.ok(first);
    await rejectsByTrigger(
      run(
        `UPDATE charges SET first_submitted_at = first_submitted_at + interval '1 hour'
         WHERE id = $1`,
        [chargeId],
      ),
    );
    // Rechazo vigente y nueva subida: la primera subida se conserva.
    await updateToStatus(chargeId, group.ownerId, 'pendiente');
    await rejectsByTrigger(
      run(`UPDATE charges SET first_submitted_at = NULL WHERE id = $1`, [chargeId]),
    );
    await rejectsByTrigger(
      run(
        `UPDATE charges SET status = 'en_revision',
                            first_submitted_at = first_submitted_at + interval '1 day'
         WHERE id = $1`,
        [chargeId],
      ),
    );
    const state = await chargeState(chargeId);
    assert.equal(state.status, 'pendiente');
    assert.equal(state.first_submitted_at?.getTime(), first.getTime());
  });

  // CA-002-21 / RN-002-01 / RNF-002-03: matriz completa estado × estado. Cada combinación usa un
  // grupo propio con un cobro que se lleva al estado de partida por un camino válido.
  // La diagonal de los estados no finales (pendiente, en_revision, atrasado) no es un cambio de
  // estado y no se prueba aquí; la de los finales sí, porque charges_final_readonly la rechaza.
  describe('CA-002-21: matriz de transiciones de charges_transition_guard', () => {
    const FINAL: readonly Status[] = ['pagado', 'cancelado'];
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to && !FINAL.includes(from)) continue;
        const valid = VALID_TRANSITIONS.has(`${from}>${to}`);
        const name = valid
          ? `CA-002-21 / RNF-002-03: ${from} -> ${to} es válida y version aumenta en 1`
          : `CA-002-21 / RN-002-01: ${from} -> ${to} es inválida y falla`;
        test(name, async () => {
          const { group, chargeId } = await pendingCharge();
          await reachStatus(chargeId, group.ownerId, from);
          const before = await chargeState(chargeId);
          if (valid) {
            await updateToStatus(chargeId, group.ownerId, to);
            const afterState = await chargeState(chargeId);
            assert.equal(afterState.status, to);
            assert.equal(afterState.version, before.version + 1);
          } else {
            await rejectsByTrigger(updateToStatus(chargeId, group.ownerId, to));
            const afterState = await chargeState(chargeId);
            assert.equal(afterState.status, from);
            assert.equal(afterState.version, before.version);
          }
        });
      }
    }
  });

  test('RNF-002-03: un cobro nace con version 1', async () => {
    const { chargeId } = await pendingCharge();
    assert.equal((await chargeState(chargeId)).version, 1);
  });
});

// ================================================================ receipts y payment_references

function receiptValues(chargeId: string, uploadedBy: string, overrides: Row = {}): Row {
  return {
    charge_id: chargeId,
    uploaded_by: uploadedBy,
    file_key: `receipts/prueba/${chargeId}/${randomUUID()}.jpg`,
    mime: 'image/jpeg',
    size_bytes: 120000,
    method: 'qr',
    reference: `REF-${randomUUID().slice(0, 8)}`,
    ...overrides,
  };
}

describe('receipts y payment_references (0042)', () => {
  test('RF-002-08: dos comprobantes vigentes del mismo cobro fallan', async () => {
    const { memberId, chargeId } = await pendingCharge();
    await insertRow('receipts', receiptValues(chargeId, memberId));
    await rejectsWith(insertRow('receipts', receiptValues(chargeId, memberId)), {
      code: UNIQUE_VIOLATION,
      constraint: 'receipts_one_active_uq',
    });
  });

  test('RF-002-08: con el anterior reemplazado, un nuevo comprobante vigente se acepta', async () => {
    const { memberId, chargeId } = await pendingCharge();
    const first = await insertRow('receipts', receiptValues(chargeId, memberId));
    await run(`UPDATE receipts SET status = 'reemplazado' WHERE id = $1`, [first]);
    await insertRow('receipts', receiptValues(chargeId, memberId));
    assert.equal(await count('receipts', 'charge_id = $1', [chargeId]), 2);
  });

  test('CA-002-05: un comprobante de 6 MB falla y uno de 5 MB exactos se acepta', async () => {
    const { memberId, chargeId } = await pendingCharge();
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { size_bytes: 6 * 1024 * 1024 })),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(insertRow('receipts', receiptValues(chargeId, memberId, { size_bytes: 0 })), {
      code: CHECK_VIOLATION,
    });
    await insertRow('receipts', receiptValues(chargeId, memberId, { size_bytes: FIVE_MB }));
  });

  test('CA-002-05: un comprobante con mime no permitido falla', async () => {
    const { memberId, chargeId } = await pendingCharge();
    for (const mime of ['application/x-msdownload', 'image/gif', 'text/plain']) {
      await rejectsWith(insertRow('receipts', receiptValues(chargeId, memberId, { mime })), {
        code: CHECK_VIOLATION,
      });
    }
    assert.equal(await count('receipts', 'charge_id = $1', [chargeId]), 0);
  });

  test('CA-002-26 / RF-002-07: referencia vacía o de más de 100 caracteres falla; nula por NOT NULL', async () => {
    const { memberId, chargeId } = await pendingCharge();
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { reference: '   ' })),
      {
        code: CHECK_VIOLATION,
      },
    );
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { reference: 'x'.repeat(101) })),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { reference: null })),
      {
        code: NOT_NULL_VIOLATION,
      },
    );
  });

  test('RF-002-06: method y status fuera de los valores fallan; charge_id inexistente por FK', async () => {
    const { memberId, chargeId } = await pendingCharge();
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { method: 'efectivo' })),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow('receipts', receiptValues(chargeId, memberId, { status: 'otro' })),
      {
        code: CHECK_VIOLATION,
      },
    );
    await rejectsWith(insertRow('receipts', receiptValues(MISSING_ID, memberId)), {
      code: FK_VIOLATION,
    });
  });

  test('RF-002-08: las columnas de archivo de un comprobante no cambian (receipts_file_immutable)', async () => {
    const { memberId, chargeId } = await pendingCharge();
    const id = await insertRow('receipts', receiptValues(chargeId, memberId));
    await rejectsByTrigger(
      run(`UPDATE receipts SET file_key = 'receipts/otro.jpg' WHERE id = $1`, [id]),
    );
    await rejectsByTrigger(run(`UPDATE receipts SET reference = 'OTRA-REF' WHERE id = $1`, [id]));
    await run(`UPDATE receipts SET status = 'rechazado', file_deleted_at = now() WHERE id = $1`, [
      id,
    ]);
  });

  test('CA-002-27 / CA-010-41: referencia repetida activa en el mismo grupo falla', async () => {
    const group = await createGroup();
    await insertRow('payment_references', {
      group_id: group.id,
      reference_key: 'TRX 123',
      source_type: 'receipt',
      source_id: randomUUID(),
    });
    await rejectsWith(
      insertRow('payment_references', {
        group_id: group.id,
        reference_key: 'TRX 123',
        source_type: 'join_request',
        source_id: randomUUID(),
      }),
      { code: UNIQUE_VIOLATION, constraint: 'payment_references_active_uq' },
    );
  });

  test('CA-002-27 / CA-010-41: referencia liberada en el mismo grupo se acepta', async () => {
    const group = await createGroup();
    const first = await insertRow('payment_references', {
      group_id: group.id,
      reference_key: 'TRX 456',
      source_type: 'receipt',
      source_id: randomUUID(),
    });
    await run(`UPDATE payment_references SET released_at = now() WHERE id = $1`, [first]);
    await insertRow('payment_references', {
      group_id: group.id,
      reference_key: 'TRX 456',
      source_type: 'receipt',
      source_id: randomUUID(),
    });
    assert.equal(await count('payment_references', 'group_id = $1', [group.id]), 2);
  });

  test('CA-002-27 / CA-010-41: la misma referencia en otro grupo se acepta', async () => {
    const a = await createGroup();
    const b = await createGroup();
    for (const group of [a, b]) {
      await insertRow('payment_references', {
        group_id: group.id,
        reference_key: 'TRX 789',
        source_type: 'receipt',
        source_id: randomUUID(),
      });
    }
    assert.equal(
      await count('payment_references', `reference_key = 'TRX 789' AND group_id IN ($1, $2)`, [
        a.id,
        b.id,
      ]),
      2,
    );
  });

  test('CA-002-27: source_type fuera de los valores falla; group_id inexistente por FK', async () => {
    const group = await createGroup();
    await rejectsWith(
      insertRow('payment_references', {
        group_id: group.id,
        reference_key: 'TRX 999',
        source_type: 'otro',
        source_id: randomUUID(),
      }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow('payment_references', {
        group_id: MISSING_ID,
        reference_key: 'TRX 999',
        source_type: 'receipt',
        source_id: randomUUID(),
      }),
      { code: FK_VIOLATION },
    );
  });
});

// ================================================================ charge_events

describe('charge_events (0044)', () => {
  async function eventFor(overrides: Row = {}): Promise<{ id: string; chargeId: string }> {
    const { group, chargeId } = await pendingCharge();
    const id = await insertRow('charge_events', {
      charge_id: chargeId,
      group_id: group.id,
      type: 'generado',
      actor_kind: 'sistema',
      to_status: 'pendiente',
      ...overrides,
    });
    return { id, chargeId };
  }

  test('RNF-002-04: UPDATE en charge_events falla con 23001', async () => {
    const { id } = await eventFor();
    await rejectsWith(run(`UPDATE charge_events SET reason = 'cambio' WHERE id = $1`, [id]), {
      code: RESTRICT_VIOLATION,
    });
    const [row] = await run<{ reason: string | null }>(
      'SELECT reason FROM charge_events WHERE id = $1',
      [id],
    );
    assert.equal(row?.reason, null);
  });

  test('RNF-002-04: DELETE en charge_events falla con 23001', async () => {
    const { id } = await eventFor();
    await rejectsWith(run(`DELETE FROM charge_events WHERE id = $1`, [id]), {
      code: RESTRICT_VIOLATION,
    });
    assert.equal(await count('charge_events', 'id = $1', [id]), 1);
  });

  test('RNF-002-04 (H1): from_status o to_status fuera de los estados fallan', async () => {
    await rejectsWith(eventFor({ from_status: 'perdido' }), { code: CHECK_VIOLATION });
    await rejectsWith(eventFor({ to_status: 'pendiente_revision' }), { code: CHECK_VIOLATION });
  });

  test('RF-002-17: type o actor_kind fuera de los valores, o actor incoherente, fallan', async () => {
    const actor = await newUserId();
    await rejectsWith(eventFor({ type: 'otro' }), { code: CHECK_VIOLATION });
    await rejectsWith(eventFor({ actor_kind: 'robot' }), { code: CHECK_VIOLATION });
    await rejectsWith(eventFor({ actor_kind: 'usuario' }), { code: CHECK_VIOLATION });
    await rejectsWith(eventFor({ actor_kind: 'sistema', actor_id: actor }), {
      code: CHECK_VIOLATION,
    });
    await eventFor({ actor_kind: 'usuario', actor_id: actor, type: 'comprobante_subido' });
  });

  test('RF-002-17: un evento con charge_id inexistente falla por FK', async () => {
    const group = await createGroup();
    await rejectsWith(
      insertRow('charge_events', {
        charge_id: MISSING_ID,
        group_id: group.id,
        type: 'generado',
        actor_kind: 'sistema',
      }),
      { code: FK_VIOLATION },
    );
  });
});
