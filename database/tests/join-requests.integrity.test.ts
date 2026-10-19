// Spec 010 (data-model.md §1, §2 y §3, con los ajustes H1, H2, M1-M3, M6 y L1 aprobados el
// 2026-10-19): integridad de join_requests (0050), join_request_events (0051), join_messages y
// join_request_reads (0052), join_disputes (0053), sus disparadores (0054) y las claves que 0055
// agrega a charges y group_members. Cada restricción se prueba intentando violarla. Todos los
// datos son ficticios: usuarios de prueba con hash y CI arbitrarios y grupos con precio inventado.
//
// Pruebas primero (T001): hasta que existan 0050-0055 este archivo falla por relaciones
// inexistentes.
//
// Un grupo se crea con INSERT en groups y la fila del titular en group_members en una sola
// transacción (disparador diferido groups_owner_member_consistency de la spec 001). El cobro de
// ingreso de una solicitud aceptada nace 'pagado' con settlement 'ingreso' (spec 002, RN-002-10).
// Los CHECK y los índices únicos se comprueban por código (23514, 23505, 23503, 23502); los
// disparadores pueden responder 23514 o 23001, y en ese caso además se verifica el efecto.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
const SIX_MB = 6 * 1024 * 1024;
const MINUTE = 60 * 1000;

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

// UPDATE table SET <patch> WHERE id = $1.
async function updateRow(table: string, id: string, patch: Row): Promise<void> {
  const columns = Object.keys(patch);
  assert.ok(columns.length > 0);
  const sets = columns.map((column, i) => `${column} = $${i + 2}`);
  await run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...Object.values(patch)]);
}

async function count(table: string, where: string, params: unknown[]): Promise<number> {
  const [row] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return row?.n ?? -1;
}

// Fila completa en jsonb, para comprobar que un intento fallido no cambió nada.
async function snapshot(table: string, id: string): Promise<unknown> {
  const [row] = await run<{ row: unknown }>(
    `SELECT to_jsonb(t) AS row FROM ${table} t WHERE id = $1`,
    [id],
  );
  assert.ok(row);
  return row.row;
}

// ---------------------------------------------------------------- usuarios ficticios

let sequence = 0;

function defaultUser(): Row {
  sequence += 1;
  const n = sequence;
  const email = `join${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${3000000 + n}`),
    phone_e164: `+5917${String(n).padStart(7, '0')}`,
    telegram_user_id: String(700000000 + n),
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
  let n = codeSequence + 15485;
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

// ---------------------------------------------------------------- ciclos y cobros de ingreso

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

// Ciclo regular que respeta todos los CHECK de billing_cycles: period = mes del corte,
// due_date = corte + 3, base = floor(total / n), titular = base + resto.
async function createCycle(group: CreatedGroup, cut = '2025-03-05'): Promise<Cycle> {
  const total = 6000;
  const members = 4;
  const base = Math.floor(total / members);
  const remainder = total - base * members;
  const issuedAt = `${cut}T12:00:00Z`;
  const values: Row = {
    group_id: group.id,
    owner_id: group.ownerId,
    period: cut.slice(0, 7),
    cycle_type: 'regular',
    cut_date: cut,
    due_date: addDays(cut, 3),
    issued_at: issuedAt,
    price_cents: total,
    currency: 'BS',
    exchange_rate: null,
    total_bs_cents: total,
    member_count: members,
    base_share_cents: base,
    owner_share_cents: base + remainder,
    remainder_cents: remainder,
    finalized_at: issuedAt,
  };
  const id = await insertRow('billing_cycles', values);
  return { id, groupId: group.id, ownerId: group.ownerId, values };
}

// Cobro de origen 'ingreso' (spec 002 RN-002-10, spec 010 RN-010-03): nace pagado, se liquida
// como ingreso y apunta a la solicitud de la que nace.
function entryChargeValues(cycle: Cycle, userId: string, requestId: string): Row {
  const v = cycle.values;
  const members = Number(v.member_count) + 1;
  return {
    group_id: cycle.groupId,
    user_id: userId,
    cycle_id: cycle.id,
    period: v.period,
    origin: 'ingreso',
    join_request_id: requestId,
    status: 'pagado',
    amount_cents: Math.floor(Number(v.total_bs_cents) / members),
    price_cents: v.price_cents,
    currency: v.currency,
    exchange_rate: v.exchange_rate,
    total_bs_cents: v.total_bs_cents,
    member_count: members,
    issued_at: v.issued_at,
    due_at: `${addDays(String(v.cut_date), 4)}T04:00:00Z`,
    paid_at: v.issued_at,
    settled_by: cycle.ownerId,
    settlement: 'ingreso',
  };
}

function insertEntryCharge(cycle: Cycle, userId: string, requestId: string): Promise<string> {
  return insertRow('charges', entryChargeValues(cycle, userId, requestId));
}

// ---------------------------------------------------------------- solicitudes

const STATUSES = [
  'abierta',
  'esperando_pago',
  'pago_informado',
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
] as const;
type Status = (typeof STATUSES)[number];
const FINAL: readonly Status[] = ['aceptada', 'rechazada', 'cancelada', 'expirada'];
const ACTIVE: readonly Status[] = ['abierta', 'esperando_pago', 'pago_informado'];

// RN-010-05 (spec.md §8), copiada tal cual:
//
//   | Desde | Hacia | Quién | Condición |
//   |---|---|---|---|
//   | _(nueva)_ | `abierta` | Solicitante | Ingresa un código válido (o solicita un cupo publicado, spec 008) con la ventana de ingreso abierta |
//   | `abierta` | `esperando_pago` | Titular | Envía los datos de pago, hay cupo disponible y la ventana está abierta |
//   | `abierta` | `cancelada` | Solicitante | Cancela |
//   | `abierta` | `expirada` | Sistema | Pasan 24 horas sin que el titular envíe los datos de pago, o termina la ventana de ingreso (lo que ocurra primero) |
//   | `esperando_pago` | `pago_informado` | Solicitante | Sube el comprobante dentro del plazo de pago |
//   | `esperando_pago` | `aceptada` | Titular | Registra un pago en efectivo |
//   | `esperando_pago` | `cancelada` | Solicitante | Cancela |
//   | `esperando_pago` | `expirada` | Sistema | Pasan 15 minutos (30 si se prorrogó) sin comprobante |
//   | `pago_informado` | `aceptada` | Titular | Confirma |
//   | `pago_informado` | `expirada` | Sistema | Pasan 60 minutos sin decisión |
//   | `abierta` / `esperando_pago` / `pago_informado` | `rechazada` | Titular | Rechaza con motivo |
//   | `abierta` / `esperando_pago` / `pago_informado` | `rechazada` | Sistema | El grupo se cierra, el titular es baneado o no queda cupo |
//   | `abierta` / `esperando_pago` / `pago_informado` | `cancelada` | Sistema | La cuenta del solicitante es suspendida o baneada |
//   | `abierta` | `cancelada` | Sistema | El solicitante fue aceptado en otro grupo del mismo servicio (spec 008, RN-008-05) |
//
//   `aceptada`, `rechazada`, `cancelada` y `expirada` son estados **finales**. Cualquier otra
//   transición es inválida.
//
// La base solo impone el par desde/hacia; quién y la condición (plazos, ventana, cupo) son reglas
// del backend. La fila (nueva) -> abierta la impone join_requests_initial_status.
const VALID_TRANSITIONS = new Set<string>([
  'abierta>esperando_pago',
  'abierta>cancelada',
  'abierta>expirada',
  'abierta>rechazada',
  'esperando_pago>pago_informado',
  'esperando_pago>aceptada',
  'esperando_pago>cancelada',
  'esperando_pago>expirada',
  'esperando_pago>rechazada',
  'pago_informado>aceptada',
  'pago_informado>expirada',
  'pago_informado>rechazada',
  'pago_informado>cancelada',
]);

interface Context {
  group: CreatedGroup;
  cycle: Cycle;
}

async function newContext(groupOverrides: Row = {}): Promise<Context> {
  const group = await createGroup(groupOverrides);
  const cycle = await createCycle(group);
  return { group, cycle };
}

function requestValues(groupId: string, applicantId: string, overrides: Row = {}): Row {
  const openedAt = new Date();
  return {
    group_id: groupId,
    applicant_id: applicantId,
    opened_at: openedAt,
    open_deadline_at: new Date(openedAt.getTime() + 24 * 60 * MINUTE),
    ...overrides,
  };
}

function openRequest(groupId: string, applicantId: string, overrides: Row = {}): Promise<string> {
  return insertRow('join_requests', requestValues(groupId, applicantId, overrides));
}

interface RequestState {
  status: Status;
  version: number;
  applicant_id: string;
}

async function requestState(id: string): Promise<RequestState> {
  const [row] = await run<RequestState & Row>(
    'SELECT status, version, applicant_id FROM join_requests WHERE id = $1',
    [id],
  );
  assert.ok(row);
  return row;
}

let referenceSequence = 0;

// Cotización y datos de pago (RN-010-01): cuota de ingreso = total en Bs / (miembros + 1).
function quoteFields(): Row {
  const sentAt = new Date();
  return {
    quote_amount_cents: 3000,
    quote_price_cents: 862,
    quote_currency: 'USD',
    quote_exchange_rate: '6.9600',
    quote_total_bs_cents: 6000,
    quote_member_count: 2,
    payment_text: 'Transferir a la cuenta ficticia 000-000-000',
    payment_sent_at: sentAt,
    pay_deadline_at: new Date(sentAt.getTime() + 15 * MINUTE),
  };
}

// Comprobante del solicitante (RF-010-13) y plazo de decisión (RF-010-17).
function proofFields(): Row {
  referenceSequence += 1;
  const uploadedAt = new Date();
  return {
    proof_key: `join-requests/ficticio/${referenceSequence}.jpg`,
    proof_mime: 'image/jpeg',
    proof_size_bytes: 1024,
    proof_method: 'qr',
    proof_reference: `REF-${referenceSequence}`,
    proof_uploaded_at: uploadedAt,
    decision_deadline_at: new Date(uploadedAt.getTime() + 60 * MINUTE),
  };
}

// Estados de partida que ya tienen cotización o comprobante (por el camino de reachStatus): el
// parche no los vuelve a fijar, para no chocar con join_requests_quote_immutable.
function hasQuote(status: Status): boolean {
  return status === 'esperando_pago' || status === 'pago_informado' || status === 'aceptada';
}

// Columnas que exigen los CHECK de coherencia para entrar a `to` desde `from`, de modo que el
// único motivo de rechazo posible sea la transición. Para un destino activo se vacían las marcas
// de cierre (final_at, final_reason) que pudiera traer un estado final.
async function transitionPatch(
  ctx: Context,
  requestId: string,
  from: Status,
  to: Status,
): Promise<Row> {
  const patch: Row = { status: to };
  if ((to === 'esperando_pago' || to === 'pago_informado') && !hasQuote(from)) {
    Object.assign(patch, quoteFields());
  }
  if (to === 'pago_informado' && from !== 'pago_informado') {
    Object.assign(patch, proofFields());
  }
  if (ACTIVE.includes(to)) {
    Object.assign(patch, { final_at: null, final_reason: null });
  }
  const now = new Date();
  if (to === 'aceptada') {
    const { applicant_id } = await requestState(requestId);
    const chargeId = await insertEntryCharge(ctx.cycle, applicant_id, requestId);
    const byProof = from === 'pago_informado';
    Object.assign(patch, {
      final_at: now,
      final_reason: byProof ? 'confirmada' : 'efectivo',
      accepted_method: byProof ? 'comprobante' : 'efectivo',
      decided_by: ctx.group.ownerId,
      charge_id: chargeId,
    });
  }
  if (to === 'rechazada') {
    Object.assign(patch, {
      final_at: now,
      final_reason: 'rechazo_titular',
      reject_reason: 'Motivo de prueba',
      decided_by: ctx.group.ownerId,
    });
  }
  if (to === 'cancelada') {
    Object.assign(patch, { final_at: now, final_reason: 'cancelada_solicitante' });
  }
  if (to === 'expirada') {
    Object.assign(patch, { final_at: now, final_reason: 'plazo_pago' });
  }
  return patch;
}

async function transition(ctx: Context, requestId: string, from: Status, to: Status) {
  await updateRow('join_requests', requestId, await transitionPatch(ctx, requestId, from, to));
}

// Lleva una solicitud 'abierta' al estado `target` por un camino válido de RN-010-05.
async function reachStatus(ctx: Context, requestId: string, target: Status): Promise<void> {
  const paths: Record<Status, Status[]> = {
    abierta: [],
    esperando_pago: ['esperando_pago'],
    pago_informado: ['esperando_pago', 'pago_informado'],
    aceptada: ['esperando_pago', 'aceptada'],
    rechazada: ['rechazada'],
    cancelada: ['cancelada'],
    expirada: ['expirada'],
  };
  let current: Status = 'abierta';
  for (const next of paths[target]) {
    await transition(ctx, requestId, current, next);
    current = next;
  }
  assert.equal((await requestState(requestId)).status, target);
}

// Solicitud nueva de una persona nueva en el grupo del contexto, llevada a `status`.
async function requestIn(
  ctx: Context,
  status: Status = 'abierta',
): Promise<{ id: string; applicantId: string }> {
  const applicantId = await newUserId();
  const id = await openRequest(ctx.group.id, applicantId);
  await reachStatus(ctx, id, status);
  return { id, applicantId };
}

async function activeRequestsOf(applicantId: string): Promise<number> {
  return count(
    'join_requests',
    `applicant_id = $1 AND status IN ('abierta', 'esperando_pago', 'pago_informado')`,
    [applicantId],
  );
}

// Dos transacciones abiertas en paralelo con clientes distintos. Devuelve cuántas confirmaron.
async function raceTwo(work: (client: pg.Client, index: number) => Promise<unknown>) {
  const a = await connect();
  const b = await connect();
  try {
    await a.query('BEGIN');
    await b.query('BEGIN');
    const attempt = async (client: pg.Client, index: number): Promise<void> => {
      await work(client, index);
      await client.query('COMMIT');
    };
    const results = await Promise.allSettled([attempt(a, 0), attempt(b, 1)]);
    return results.filter((result) => result.status === 'fulfilled').length;
  } finally {
    await a.query('ROLLBACK').catch(() => undefined);
    await b.query('ROLLBACK').catch(() => undefined);
    await a.end();
    await b.end();
  }
}

// ================================================================ join_requests: valores e inicio

describe('join_requests: valores por defecto y estado inicial', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext();
  });

  test('RN-010-05, RNF-010-05: una solicitud nace abierta, por código, con version 1', async () => {
    const { id } = await requestIn(ctx);
    const [row] = await run(
      'SELECT status, source, listing_id, version, rejected_as_false FROM join_requests WHERE id = $1',
      [id],
    );
    assert.deepEqual(row, {
      status: 'abierta',
      source: 'codigo',
      listing_id: null,
      version: 1,
      rejected_as_false: false,
    });
  });

  test('RN-010-05 (L1): una solicitud que no nace abierta falla', async () => {
    for (const status of STATUSES.filter((s) => s !== 'abierta')) {
      const applicantId = await newUserId();
      const extra: Row = { status };
      if (status === 'esperando_pago' || status === 'pago_informado') {
        Object.assign(extra, quoteFields());
      }
      if (status === 'pago_informado') Object.assign(extra, proofFields());
      if (FINAL.includes(status)) {
        Object.assign(extra, { final_at: new Date(), final_reason: 'plazo_solicitud' });
      }
      if (status === 'aceptada') {
        // Un cobro de ingreso válido de otra solicitud, para que solo actúe el disparador.
        const other = await requestIn(ctx);
        const chargeId = await insertEntryCharge(ctx.cycle, other.applicantId, other.id);
        Object.assign(extra, {
          final_reason: 'efectivo',
          accepted_method: 'efectivo',
          decided_by: ctx.group.ownerId,
          charge_id: chargeId,
        });
      }
      await rejectsByTrigger(openRequest(ctx.group.id, applicantId, extra));
      assert.equal(await count('join_requests', 'applicant_id = $1', [applicantId]), 0, status);
    }
  });

  test('RN-010-05: un status fuera de los siete valores falla', async () => {
    const applicantId = await newUserId();
    await assert.rejects(openRequest(ctx.group.id, applicantId, { status: 'borrador' }));
    const { id } = await requestIn(ctx);
    await rejectsByTrigger(updateRow('join_requests', id, { status: 'borrador' }));
    assert.equal((await requestState(id)).status, 'abierta');
  });

  test('RF-010-02 (spec 008): source y listing_id van juntos; un source desconocido falla', async () => {
    const listingId = '11111111-1111-4111-8111-111111111111';
    await rejectsWith(openRequest(ctx.group.id, await newUserId(), { source: 'publicacion' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(openRequest(ctx.group.id, await newUserId(), { listing_id: listingId }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(openRequest(ctx.group.id, await newUserId(), { source: 'otro' }), {
      code: CHECK_VIOLATION,
    });
    // listing_id todavía no tiene FK (la agrega la spec 008): una publicación con id se acepta.
    const id = await openRequest(ctx.group.id, await newUserId(), {
      source: 'publicacion',
      listing_id: listingId,
    });
    assert.equal((await requestState(id)).status, 'abierta');
  });

  test('RN-010-05: opened_at y open_deadline_at son obligatorios; un solicitante inexistente falla', async () => {
    await rejectsWith(openRequest(ctx.group.id, await newUserId(), { opened_at: null }), {
      code: NOT_NULL_VIOLATION,
    });
    await rejectsWith(openRequest(ctx.group.id, await newUserId(), { open_deadline_at: null }), {
      code: NOT_NULL_VIOLATION,
    });
    await rejectsWith(openRequest(ctx.group.id, MISSING_ID), { code: FK_VIOLATION });
  });
});

// ================================================================ una activa por persona y límite

describe('join_requests: unicidad y límite de activas (RF-010-02, CA-010-03)', () => {
  test('RF-010-02, CA-010-03: dos solicitudes activas de la misma persona al mismo grupo fallan; tras un estado final se permite otra', async () => {
    const ctx = await newContext();
    for (const final of FINAL) {
      const { id, applicantId } = await requestIn(ctx);
      for (const active of ACTIVE) {
        // La primera sigue activa en cada estado activo: la segunda falla.
        if (active !== 'abierta') {
          const previous = (await requestState(id)).status;
          await transition(ctx, id, previous, active);
        }
        await rejectsWith(openRequest(ctx.group.id, applicantId), {
          code: UNIQUE_VIOLATION,
          constraint: 'join_requests_active_uq',
        });
      }
      // pago_informado -> final (aceptada, rechazada, cancelada y expirada son válidas desde aquí).
      await transition(ctx, id, 'pago_informado', final);
      const again = await openRequest(ctx.group.id, applicantId);
      assert.equal((await requestState(again)).status, 'abierta', final);
    }
  });

  test('CA-010-03: la sexta solicitud activa de una persona falla; tras un estado final se permite', async () => {
    const applicantId = await newUserId();
    const contexts: Context[] = [];
    for (let i = 0; i < 6; i += 1) contexts.push(await newContext());
    const ids: string[] = [];
    for (const ctx of contexts.slice(0, 5)) ids.push(await openRequest(ctx.group.id, applicantId));
    const sixth = contexts[5];
    assert.ok(sixth);
    await rejectsByTrigger(openRequest(sixth.group.id, applicantId));
    assert.equal(await activeRequestsOf(applicantId), 5);
    assert.equal(await count('join_requests', 'group_id = $1', [sixth.group.id]), 0);

    // Las de esperando_pago y pago_informado también cuentan como activas.
    const [first, second] = ids;
    const [ctxFirst, ctxSecond] = contexts;
    assert.ok(first && second && ctxFirst && ctxSecond);
    await reachStatus(ctxFirst, first, 'esperando_pago');
    await reachStatus(ctxSecond, second, 'pago_informado');
    await rejectsByTrigger(openRequest(sixth.group.id, applicantId));

    await transition(ctxFirst, first, 'esperando_pago', 'cancelada');
    const id = await openRequest(sixth.group.id, applicantId);
    assert.equal((await requestState(id)).status, 'abierta');
    assert.equal(await activeRequestsOf(applicantId), 5);
  });

  test('CA-010-03: con cuatro activas, dos inserciones concurrentes: exactamente una pasa', async () => {
    const applicantId = await newUserId();
    const contexts: Context[] = [];
    for (let i = 0; i < 6; i += 1) contexts.push(await newContext());
    for (const ctx of contexts.slice(0, 4)) await openRequest(ctx.group.id, applicantId);
    const targets = contexts.slice(4);
    const committed = await raceTwo((client, index) => {
      const target = targets[index];
      assert.ok(target);
      return insertWith(client, 'join_requests', requestValues(target.group.id, applicantId));
    });
    assert.equal(committed, 1);
    assert.equal(await activeRequestsOf(applicantId), 5);
  });
});

// ================================================================ miembro activo y grupo abierto

describe('join_requests: solicitante no miembro y grupo abierto (CA-010-02)', () => {
  test('CA-010-02: el titular, miembro activo, no puede abrir una solicitud a su grupo', async () => {
    const ctx = await newContext();
    await rejectsByTrigger(openRequest(ctx.group.id, ctx.group.ownerId));
    assert.equal(await count('join_requests', 'group_id = $1', [ctx.group.id]), 0);
  });

  test('CA-010-02: un miembro activo no puede abrir solicitud; tras salir del grupo sí', async () => {
    const ctx = await newContext();
    const { id, applicantId } = await requestIn(ctx, 'aceptada');
    const memberId = await insertRow('group_members', {
      group_id: ctx.group.id,
      user_id: applicantId,
      role: 'miembro',
      join_source: 'solicitud',
      join_request_id: id,
    });
    await rejectsByTrigger(openRequest(ctx.group.id, applicantId));
    assert.equal(await activeRequestsOf(applicantId), 0);

    await updateRow('group_members', memberId, { left_at: new Date(), left_reason: 'abandono' });
    const again = await openRequest(ctx.group.id, applicantId);
    assert.equal((await requestState(again)).status, 'abierta');
  });

  test('CA-010-02: un grupo cerrado no admite solicitudes', async () => {
    const ctx = await newContext();
    await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [
      ctx.group.id,
    ]);
    await rejectsByTrigger(openRequest(ctx.group.id, await newUserId()));
    assert.equal(await count('join_requests', 'group_id = $1', [ctx.group.id]), 0);
  });

  test('CA-010-02, RF-009-22: un grupo congelado no admite solicitudes', async () => {
    const ctx = await newContext();
    await run(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
      [ctx.group.id],
    );
    await rejectsByTrigger(openRequest(ctx.group.id, await newUserId()));
    assert.equal(await count('join_requests', 'group_id = $1', [ctx.group.id]), 0);
  });
});

// ================================================================ matriz de transiciones

// CA-010-25 / RN-010-05 / RNF-010-05: matriz completa estado × estado (VALID_TRANSITIONS es la
// tabla de RN-010-05). Cada combinación usa una persona nueva con una solicitud llevada al estado
// de partida por un camino válido. El parche trae las columnas que exigen los CHECK del destino,
// así que una inválida solo puede fallar por join_requests_transition_guard.
// La diagonal (mismo estado) no es un cambio de estado y no se prueba aquí, como en CA-002-21.
describe('CA-010-25: matriz de transiciones de join_requests_transition_guard', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (from === to) continue;
      const valid = VALID_TRANSITIONS.has(`${from}>${to}`);
      const name = valid
        ? `CA-010-25 / RNF-010-05: ${from} -> ${to} es válida y version aumenta en 1`
        : FINAL.includes(from)
          ? `CA-010-25 / RN-010-05: ${from} es final y ${from} -> ${to} falla`
          : `CA-010-25 / RN-010-05: ${from} -> ${to} es inválida y falla`;
      test(name, async () => {
        const { id } = await requestIn(ctx, from);
        const before = await requestState(id);
        const beforeRow = await snapshot('join_requests', id);
        const patch = await transitionPatch(ctx, id, from, to);
        if (valid) {
          await updateRow('join_requests', id, patch);
          const afterState = await requestState(id);
          assert.equal(afterState.status, to);
          assert.equal(afterState.version, before.version + 1);
        } else {
          await rejectsByTrigger(updateRow('join_requests', id, patch));
          assert.deepEqual(await snapshot('join_requests', id), beforeRow);
        }
      });
    }
  }
});

describe('join_requests: estados finales (RN-010-05)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  test('RN-010-05: desde un estado final no se vuelve a ningún estado activo ni final', async () => {
    for (const final of FINAL) {
      const { id } = await requestIn(ctx, final);
      for (const to of STATUSES.filter((s) => s !== final)) {
        const beforeRow = await snapshot('join_requests', id);
        await rejectsByTrigger(
          updateRow('join_requests', id, await transitionPatch(ctx, id, final, to)),
        );
        assert.deepEqual(await snapshot('join_requests', id), beforeRow, `${final} -> ${to}`);
      }
    }
  });

  test('RNF-010-09: una solicitud final admite marcar content_purged_at (retención)', async () => {
    for (const final of FINAL) {
      const { id } = await requestIn(ctx, final);
      await updateRow('join_requests', id, { content_purged_at: new Date() });
      const state = await requestState(id);
      assert.equal(state.status, final);
    }
  });

  test('RN-010-05: un estado final exige final_at y final_reason, y uno activo no los admite', async () => {
    for (const final of FINAL.filter((s) => s !== 'aceptada')) {
      const { id } = await requestIn(ctx);
      const patch = await transitionPatch(ctx, id, 'abierta', final);
      await rejectsWith(updateRow('join_requests', id, { ...patch, final_at: null }), {
        code: CHECK_VIOLATION,
      });
      await rejectsWith(updateRow('join_requests', id, { ...patch, final_reason: null }), {
        code: CHECK_VIOLATION,
      });
      assert.equal((await requestState(id)).status, 'abierta');
    }
    const { id } = await requestIn(ctx);
    await rejectsWith(
      updateRow('join_requests', id, { final_at: new Date(), final_reason: 'plazo_solicitud' }),
      { code: CHECK_VIOLATION },
    );
  });

  test('RN-010-05: final_reason fuera de los valores, o reject_reason de menos de 5 caracteres, falla', async () => {
    const { id } = await requestIn(ctx);
    const patch = await transitionPatch(ctx, id, 'abierta', 'rechazada');
    await rejectsWith(updateRow('join_requests', id, { ...patch, final_reason: 'otro' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(updateRow('join_requests', id, { ...patch, reject_reason: '  abc  ' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(
      updateRow('join_requests', id, { ...patch, reject_reason: 'x'.repeat(201) }),
      {
        code: CHECK_VIOLATION,
      },
    );
    assert.equal((await requestState(id)).status, 'abierta');
  });
});

// ================================================================ cotización y prórroga

describe('join_requests: cotización inmutable y prórroga única (CA-010-26, CA-010-42)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ price_cents: 862, currency: 'USD', exchange_rate: '6.9600' });
  });

  test('CA-010-26, RN-010-01, RN-010-10: cada columna quote_* fijada no cambia', async () => {
    const changes: Row = {
      quote_amount_cents: 3001,
      quote_price_cents: 863,
      quote_currency: 'BS',
      quote_exchange_rate: '7.0000',
      quote_total_bs_cents: 6001,
      quote_member_count: 3,
    };
    const { id } = await requestIn(ctx, 'esperando_pago');
    for (const [column, value] of Object.entries(changes)) {
      const beforeRow = await snapshot('join_requests', id);
      await rejectsByTrigger(updateRow('join_requests', id, { [column]: value }));
      assert.deepEqual(await snapshot('join_requests', id), beforeRow, column);
    }
    // También al pasar a pago_informado junto con la transición válida.
    const beforeRow = await snapshot('join_requests', id);
    await rejectsByTrigger(
      updateRow('join_requests', id, {
        ...(await transitionPatch(ctx, id, 'esperando_pago', 'pago_informado')),
        quote_amount_cents: 2999,
      }),
    );
    assert.deepEqual(await snapshot('join_requests', id), beforeRow);
  });

  test('CA-010-26: borrar la cotización o volver a fijar payment_sent_at falla', async () => {
    const { id } = await requestIn(ctx, 'esperando_pago');
    const beforeRow = await snapshot('join_requests', id);
    await rejectsByTrigger(
      updateRow('join_requests', id, { payment_sent_at: new Date(Date.now() + MINUTE) }),
    );
    await assert.rejects(
      updateRow('join_requests', id, { quote_amount_cents: null, payment_sent_at: null }),
    );
    assert.deepEqual(await snapshot('join_requests', id), beforeRow);
  });

  test('CA-010-26: cambiar el tipo de cambio del grupo no cambia la cuota cotizada', async () => {
    const { id } = await requestIn(ctx, 'esperando_pago');
    await run(`UPDATE groups SET exchange_rate = '7.5000' WHERE id = $1`, [ctx.group.id]);
    const [row] = await run<{ quote_amount_cents: string; quote_exchange_rate: string }>(
      'SELECT quote_amount_cents::text, quote_exchange_rate::text FROM join_requests WHERE id = $1',
      [id],
    );
    assert.deepEqual(row, { quote_amount_cents: '3000', quote_exchange_rate: '6.9600' });
  });

  test('RN-010-01: la cotización existe si y solo si se enviaron los datos de pago; cuota 0 falla', async () => {
    const { id } = await requestIn(ctx);
    const quote = quoteFields();
    await rejectsWith(updateRow('join_requests', id, { quote_amount_cents: 3000 }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(updateRow('join_requests', id, { payment_sent_at: quote.payment_sent_at }), {
      code: CHECK_VIOLATION,
    });
    const patch = await transitionPatch(ctx, id, 'abierta', 'esperando_pago');
    await rejectsWith(updateRow('join_requests', id, { ...patch, quote_amount_cents: 0 }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(updateRow('join_requests', id, { ...patch, pay_deadline_at: null }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(updateRow('join_requests', id, { ...patch, payment_text: 'x'.repeat(501) }), {
      code: CHECK_VIOLATION,
    });
    assert.equal((await requestState(id)).status, 'abierta');
  });

  test('CA-010-42, RF-010-28: extended_at se fija una sola vez', async () => {
    const { id } = await requestIn(ctx, 'esperando_pago');
    await run(
      `UPDATE join_requests SET extended_at = now(), pay_deadline_at = pay_deadline_at + interval '15 minutes'
       WHERE id = $1`,
      [id],
    );
    const beforeRow = await snapshot('join_requests', id);
    await rejectsByTrigger(
      run(
        `UPDATE join_requests SET extended_at = extended_at + interval '1 minute',
                                  pay_deadline_at = pay_deadline_at + interval '15 minutes'
         WHERE id = $1`,
        [id],
      ),
    );
    await rejectsByTrigger(updateRow('join_requests', id, { extended_at: null }));
    assert.deepEqual(await snapshot('join_requests', id), beforeRow);
  });

  test('RF-010-28: extended_at sin datos de pago enviados falla', async () => {
    const { id } = await requestIn(ctx);
    await rejectsWith(updateRow('join_requests', id, { extended_at: new Date() }), {
      code: CHECK_VIOLATION,
    });
  });
});

// ================================================================ comprobante

describe('join_requests: comprobante del solicitante (CA-010-08, CA-010-40)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  async function rejectsProof(overrides: Row): Promise<void> {
    const { id } = await requestIn(ctx, 'esperando_pago');
    const beforeRow = await snapshot('join_requests', id);
    const patch = await transitionPatch(ctx, id, 'esperando_pago', 'pago_informado');
    await rejectsWith(updateRow('join_requests', id, { ...patch, ...overrides }), {
      code: CHECK_VIOLATION,
    });
    assert.deepEqual(await snapshot('join_requests', id), beforeRow);
  }

  test('CA-010-08: un comprobante de 6 MB falla; de 5 MB pasa', async () => {
    await rejectsProof({ proof_size_bytes: SIX_MB });
    await rejectsProof({ proof_size_bytes: 0 });
    const { id } = await requestIn(ctx, 'esperando_pago');
    await updateRow('join_requests', id, {
      ...(await transitionPatch(ctx, id, 'esperando_pago', 'pago_informado')),
      proof_size_bytes: FIVE_MB,
    });
    assert.equal((await requestState(id)).status, 'pago_informado');
  });

  test('CA-010-08: un mime no permitido falla; PDF y PNG pasan', async () => {
    await rejectsProof({ proof_mime: 'image/gif' });
    await rejectsProof({ proof_mime: 'text/plain' });
    for (const mime of ['application/pdf', 'image/png']) {
      const { id } = await requestIn(ctx, 'esperando_pago');
      await updateRow('join_requests', id, {
        ...(await transitionPatch(ctx, id, 'esperando_pago', 'pago_informado')),
        proof_mime: mime,
      });
      assert.equal((await requestState(id)).status, 'pago_informado', mime);
    }
  });

  test('CA-010-40: un comprobante sin referencia o con referencia vacía falla y el estado no cambia', async () => {
    await rejectsProof({ proof_reference: null });
    await rejectsProof({ proof_reference: '' });
    await rejectsProof({ proof_reference: '   ' });
    await rejectsProof({ proof_reference: 'R'.repeat(101) });
  });

  test('RF-010-13, RF-010-17: pago_informado exige proof_uploaded_at y decision_deadline_at; método fuera de valores falla', async () => {
    await rejectsProof({ proof_uploaded_at: null });
    await rejectsProof({ decision_deadline_at: null });
    await rejectsProof({ proof_method: 'efectivo' });
  });
});

// ================================================================ aceptar y rechazar

describe('join_requests: aceptar y rechazar (RF-010-16, RF-010-17, RN-010-03)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  test('RF-010-17, RN-010-03: aceptar sin charge_id, accepted_method o decided_by falla', async () => {
    for (const missing of ['charge_id', 'accepted_method', 'decided_by']) {
      const { id } = await requestIn(ctx, 'pago_informado');
      const beforeRow = await snapshot('join_requests', id);
      const patch = await transitionPatch(ctx, id, 'pago_informado', 'aceptada');
      await rejectsWith(updateRow('join_requests', id, { ...patch, [missing]: null }), {
        code: CHECK_VIOLATION,
      });
      assert.deepEqual(await snapshot('join_requests', id), beforeRow, missing);
    }
  });

  test('RN-010-03: charge_id inexistente falla; accepted_method fuera de valores falla', async () => {
    const { id } = await requestIn(ctx, 'pago_informado');
    const patch = await transitionPatch(ctx, id, 'pago_informado', 'aceptada');
    await rejectsWith(updateRow('join_requests', id, { ...patch, charge_id: MISSING_ID }), {
      code: FK_VIOLATION,
    });
    await rejectsWith(updateRow('join_requests', id, { ...patch, accepted_method: 'tarjeta' }), {
      code: CHECK_VIOLATION,
    });
    assert.equal((await requestState(id)).status, 'pago_informado');
  });

  test('RF-010-16: rejected_as_false fuera de rechazada falla', async () => {
    const open = await requestIn(ctx);
    await rejectsWith(updateRow('join_requests', open.id, { rejected_as_false: true }), {
      code: CHECK_VIOLATION,
    });
    const informed = await requestIn(ctx, 'pago_informado');
    for (const to of ['cancelada', 'expirada', 'aceptada'] as const) {
      const patch = await transitionPatch(ctx, informed.id, 'pago_informado', to);
      await rejectsWith(
        updateRow('join_requests', informed.id, { ...patch, rejected_as_false: true }),
        { code: CHECK_VIOLATION },
      );
    }
    assert.equal((await requestState(informed.id)).status, 'pago_informado');
  });

  test('RF-010-16: rejected_as_false sin comprobante subido falla; con comprobante y rechazada pasa', async () => {
    const waiting = await requestIn(ctx, 'esperando_pago');
    const patch = await transitionPatch(ctx, waiting.id, 'esperando_pago', 'rechazada');
    await rejectsWith(
      updateRow('join_requests', waiting.id, { ...patch, rejected_as_false: true }),
      { code: CHECK_VIOLATION },
    );
    assert.equal((await requestState(waiting.id)).status, 'esperando_pago');

    const informed = await requestIn(ctx, 'pago_informado');
    await updateRow('join_requests', informed.id, {
      ...(await transitionPatch(ctx, informed.id, 'pago_informado', 'rechazada')),
      rejected_as_false: true,
    });
    const [row] = await run('SELECT status, rejected_as_false FROM join_requests WHERE id = $1', [
      informed.id,
    ]);
    assert.deepEqual(row, { status: 'rechazada', rejected_as_false: true });
  });
});

// ================================================================ vínculos con charges y group_members (0055)

describe('0055: vínculos de la solicitud con charges y group_members (RN-010-03, M2, M3)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  test('RN-010-03 (M2): dos cobros de ingreso de la misma solicitud fallan', async () => {
    const { id, applicantId } = await requestIn(ctx, 'aceptada');
    // Otro período, para que solo actúe charges_join_request_uq y no charges_member_period_uq.
    const april = await createCycle(ctx.group, '2025-04-05');
    await rejectsWith(insertEntryCharge(april, applicantId, id), {
      code: UNIQUE_VIOLATION,
      constraint: 'charges_join_request_uq',
    });
    assert.equal(await count('charges', 'join_request_id = $1', [id]), 1);
  });

  test('RN-010-03 (M2): un cobro de ingreso con una solicitud inexistente falla', async () => {
    await rejectsWith(insertEntryCharge(ctx.cycle, await newUserId(), MISSING_ID), {
      code: FK_VIOLATION,
    });
  });

  test('spec 001 (M3): dos estadías de la misma solicitud fallan', async () => {
    const { id, applicantId } = await requestIn(ctx, 'aceptada');
    const memberId = await insertRow('group_members', {
      group_id: ctx.group.id,
      user_id: applicantId,
      role: 'miembro',
      join_source: 'solicitud',
      join_request_id: id,
    });
    await updateRow('group_members', memberId, { left_at: new Date(), left_reason: 'abandono' });
    await rejectsWith(
      insertRow('group_members', {
        group_id: ctx.group.id,
        user_id: applicantId,
        role: 'miembro',
        join_source: 'solicitud',
        join_request_id: id,
      }),
      { code: UNIQUE_VIOLATION, constraint: 'group_members_join_request_uq' },
    );
    assert.equal(await count('group_members', 'join_request_id = $1', [id]), 1);
  });

  test('spec 001 (M3): una estadía solicitud sin join_request_id, o creacion con él, falla', async () => {
    const { id, applicantId } = await requestIn(ctx, 'aceptada');
    await rejectsWith(
      insertRow('group_members', {
        group_id: ctx.group.id,
        user_id: applicantId,
        role: 'miembro',
        join_source: 'solicitud',
      }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      insertRow('group_members', {
        group_id: ctx.group.id,
        user_id: applicantId,
        role: 'miembro',
        join_source: 'creacion',
        join_request_id: id,
      }),
      { code: CHECK_VIOLATION },
    );
    assert.equal(await count('group_members', 'user_id = $1', [applicantId]), 0);
  });

  test('spec 001 (M3): una estadía con una solicitud inexistente falla', async () => {
    await rejectsWith(
      insertRow('group_members', {
        group_id: ctx.group.id,
        user_id: await newUserId(),
        role: 'miembro',
        join_source: 'solicitud',
        join_request_id: MISSING_ID,
      }),
      { code: FK_VIOLATION },
    );
  });
});

// ================================================================ join_request_events

describe('join_request_events: línea de tiempo de solo anexado (CA-010-35)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  async function newEvent(overrides: Row = {}): Promise<{ id: string; requestId: string }> {
    const { id: requestId, applicantId } = await requestIn(ctx);
    const id = await insertRow('join_request_events', {
      request_id: requestId,
      type: 'abierta',
      actor_kind: 'usuario',
      actor_id: applicantId,
      to_status: 'abierta',
      ...overrides,
    });
    return { id, requestId };
  }

  test('CA-010-35: un evento guarda tipo, autor y fecha; metadata vale {} por defecto', async () => {
    const { id } = await newEvent();
    const [row] = await run<{ type: string; actor_kind: string; metadata: unknown; ok: boolean }>(
      `SELECT type, actor_kind, metadata, occurred_at IS NOT NULL AND actor_id IS NOT NULL AS ok
       FROM join_request_events WHERE id = $1`,
      [id],
    );
    assert.deepEqual(row, { type: 'abierta', actor_kind: 'usuario', metadata: {}, ok: true });
  });

  test('CA-010-35, RNF-010-08: UPDATE en join_request_events falla con 23001', async () => {
    const { id } = await newEvent();
    const beforeRow = await snapshot('join_request_events', id);
    await rejectsWith(updateRow('join_request_events', id, { reason: 'editado' }), {
      code: RESTRICT_VIOLATION,
    });
    assert.deepEqual(await snapshot('join_request_events', id), beforeRow);
  });

  test('CA-010-35, RNF-010-08: DELETE en join_request_events falla con 23001', async () => {
    const { id } = await newEvent();
    await rejectsWith(run('DELETE FROM join_request_events WHERE id = $1', [id]), {
      code: RESTRICT_VIOLATION,
    });
    assert.equal(await count('join_request_events', 'id = $1', [id]), 1);
  });

  test('RF-010-27: type y actor_kind fuera de los valores, o actor_id sin coherencia, fallan', async () => {
    await rejectsWith(newEvent({ type: 'editada' }), { code: CHECK_VIOLATION });
    await rejectsWith(newEvent({ actor_kind: 'admin' }), { code: CHECK_VIOLATION });
    await rejectsWith(newEvent({ actor_kind: 'sistema' }), { code: CHECK_VIOLATION });
    await rejectsWith(newEvent({ actor_id: null }), { code: CHECK_VIOLATION });
    const { id } = await newEvent({ type: 'expirada', actor_kind: 'sistema', actor_id: null });
    assert.equal(await count('join_request_events', 'id = $1', [id]), 1);
  });

  test('RF-010-27: un evento de una solicitud inexistente falla', async () => {
    await rejectsWith(
      insertRow('join_request_events', {
        request_id: MISSING_ID,
        type: 'abierta',
        actor_kind: 'sistema',
      }),
      { code: FK_VIOLATION },
    );
  });
});

// ================================================================ join_messages y join_request_reads

describe('join_messages: chat inmutable y purga controlada (CA-010-21, CA-010-23, CA-010-44)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  async function chat(): Promise<{ requestId: string; applicantId: string }> {
    const { id, applicantId } = await requestIn(ctx);
    return { requestId: id, applicantId };
  }

  function sendMessage(requestId: string, senderId: string, overrides: Row = {}): Promise<string> {
    return insertRow('join_messages', {
      request_id: requestId,
      sender_id: senderId,
      body: 'Hola, quiero entrar al grupo',
      ...overrides,
    });
  }

  test('RF-010-06: los mensajes reciben un seq creciente; texto de 1 y 1000 caracteres pasa', async () => {
    const { requestId, applicantId } = await chat();
    await sendMessage(requestId, applicantId, { body: 'a' });
    await sendMessage(requestId, ctx.group.ownerId, { body: 'b'.repeat(1000) });
    const rows = await run<{ seq: string }>(
      'SELECT seq::text FROM join_messages WHERE request_id = $1 ORDER BY created_at, seq',
      [requestId],
    );
    assert.equal(rows.length, 2);
    const [first, second] = rows.map((row) => BigInt(row.seq));
    assert.ok(first !== undefined && second !== undefined && second > first);
  });

  test('CA-010-21: un mensaje de 0 o 1001 caracteres, o sin texto ni imagen, falla', async () => {
    const { requestId, applicantId } = await chat();
    await rejectsWith(sendMessage(requestId, applicantId, { body: '' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(sendMessage(requestId, applicantId, { body: 'x'.repeat(1001) }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(sendMessage(requestId, applicantId, { body: null }), {
      code: CHECK_VIOLATION,
    });
    assert.equal(await count('join_messages', 'request_id = $1', [requestId]), 0);
  });

  test('RF-010-05: una imagen sin mime, con mime no permitido o de 6 MB falla; una imagen sin texto pasa', async () => {
    const { requestId, applicantId } = await chat();
    const image = { body: null, image_key: 'join-messages/ficticio/1.png' };
    await rejectsWith(sendMessage(requestId, applicantId, image), { code: CHECK_VIOLATION });
    await rejectsWith(
      sendMessage(requestId, applicantId, { body: null, image_mime: 'image/png' }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      sendMessage(requestId, applicantId, { ...image, image_mime: 'application/pdf' }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      sendMessage(requestId, applicantId, {
        ...image,
        image_mime: 'image/png',
        image_size_bytes: SIX_MB,
      }),
      { code: CHECK_VIOLATION },
    );
    assert.equal(await count('join_messages', 'request_id = $1', [requestId]), 0);
    await sendMessage(requestId, applicantId, {
      ...image,
      image_mime: 'image/png',
      image_size_bytes: FIVE_MB,
    });
    assert.equal(await count('join_messages', 'request_id = $1', [requestId]), 1);
  });

  test('CA-010-23: UPDATE en join_messages falla y el mensaje no cambia', async () => {
    const { requestId, applicantId } = await chat();
    const id = await sendMessage(requestId, applicantId);
    const beforeRow = await snapshot('join_messages', id);
    await rejectsByTrigger(updateRow('join_messages', id, { body: 'Mensaje editado' }));
    assert.deepEqual(await snapshot('join_messages', id), beforeRow);
  });

  test('CA-010-23: DELETE en join_messages sin vaquita.allow_purge falla', async () => {
    const { requestId, applicantId } = await chat();
    const id = await sendMessage(requestId, applicantId);
    await rejectsByTrigger(run('DELETE FROM join_messages WHERE id = $1', [id]));
    await rejectsByTrigger(
      inTransaction(async (tx) => {
        await tx.query(`SET LOCAL vaquita.allow_purge = 'off'`);
        await tx.query('DELETE FROM join_messages WHERE id = $1', [id]);
      }),
    );
    assert.equal(await count('join_messages', 'id = $1', [id]), 1);
  });

  test('CA-010-44: DELETE en join_messages con SET LOCAL vaquita.allow_purge = on funciona y no se extiende a la siguiente transacción', async () => {
    const { requestId, applicantId } = await chat();
    const purged = await sendMessage(requestId, applicantId);
    const kept = await sendMessage(requestId, ctx.group.ownerId, { body: 'Respuesta' });
    const client = await connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL vaquita.allow_purge = 'on'`);
      await client.query('DELETE FROM join_messages WHERE id = $1', [purged]);
      await client.query('COMMIT');
      // SET LOCAL termina con la transacción: un DELETE posterior en la misma sesión falla.
      await rejectsByTrigger(client.query('DELETE FROM join_messages WHERE id = $1', [kept]));
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
    assert.equal(await count('join_messages', 'id = $1', [purged]), 0);
    assert.equal(await count('join_messages', 'id = $1', [kept]), 1);
  });

  test('RF-010-05: un mensaje de una solicitud o un remitente inexistente falla', async () => {
    const { requestId, applicantId } = await chat();
    await rejectsWith(sendMessage(MISSING_ID, applicantId), { code: FK_VIOLATION });
    await rejectsWith(sendMessage(requestId, MISSING_ID), { code: FK_VIOLATION });
  });
});

describe('join_request_reads: una lectura por participante (H2)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  test('RF-010-06, RF-010-09 (H2): dos lecturas del mismo participante y solicitud fallan', async () => {
    const { id, applicantId } = await requestIn(ctx);
    const readId = await insertRow('join_request_reads', { request_id: id, user_id: applicantId });
    await insertRow('join_request_reads', { request_id: id, user_id: ctx.group.ownerId });
    await rejectsWith(insertRow('join_request_reads', { request_id: id, user_id: applicantId }), {
      code: UNIQUE_VIOLATION,
    });
    const [row] = await run<{ last_read_seq: string }>(
      'SELECT last_read_seq::text FROM join_request_reads WHERE id = $1',
      [readId],
    );
    assert.equal(row?.last_read_seq, '0');
  });

  test('H2: updated_at de join_request_reads avanza al marcar como leído', async () => {
    const { id, applicantId } = await requestIn(ctx);
    const readId = await insertRow('join_request_reads', { request_id: id, user_id: applicantId });
    await updateRow('join_request_reads', readId, { last_read_seq: 5 });
    const [row] = await run<{ advanced: boolean }>(
      'SELECT updated_at > created_at AS advanced FROM join_request_reads WHERE id = $1',
      [readId],
    );
    assert.equal(row?.advanced, true);
  });

  test('RF-010-06: una lectura de una solicitud o usuario inexistente falla', async () => {
    const { id } = await requestIn(ctx);
    await rejectsWith(
      insertRow('join_request_reads', { request_id: MISSING_ID, user_id: ctx.group.ownerId }),
      { code: FK_VIOLATION },
    );
    await rejectsWith(insertRow('join_request_reads', { request_id: id, user_id: MISSING_ID }), {
      code: FK_VIOLATION,
    });
  });
});

// ================================================================ join_disputes

describe('join_disputes: reclamos (CA-010-28, RF-010-22, RN-010-08)', () => {
  let ctx: Context;
  before(async () => {
    ctx = await newContext({ total_slots: 20 });
  });

  // Solicitud que llegó a pago_informado y terminó expirada (escenario de CA-010-27).
  async function disputedRequest(): Promise<{ id: string; applicantId: string }> {
    const request = await requestIn(ctx, 'pago_informado');
    await transition(ctx, request.id, 'pago_informado', 'expirada');
    return request;
  }

  function openDispute(
    requestId: string,
    openedBy: string,
    accusedId: string,
    overrides: Row = {},
  ) {
    return insertRow('join_disputes', {
      request_id: requestId,
      kind: 'pago_sin_ingreso',
      opened_by: openedBy,
      accused_id: accusedId,
      description: 'Pagué y el titular no confirmó mi ingreso',
      ...overrides,
    });
  }

  test('CA-010-27: un reclamo nace abierto, sin respuesta ni resolución', async () => {
    const { id, applicantId } = await disputedRequest();
    const disputeId = await openDispute(id, applicantId, ctx.group.ownerId);
    const [row] = await run(
      `SELECT status, response_text, resolution, opened_at IS NOT NULL AS opened
       FROM join_disputes WHERE id = $1`,
      [disputeId],
    );
    assert.deepEqual(row, {
      status: 'abierto',
      response_text: null,
      resolution: null,
      opened: true,
    });
  });

  test('CA-010-28: dos reclamos de la misma parte para la misma solicitud fallan; la otra parte sí puede', async () => {
    const { id, applicantId } = await disputedRequest();
    await openDispute(id, applicantId, ctx.group.ownerId);
    await rejectsWith(
      openDispute(id, applicantId, ctx.group.ownerId, { kind: 'comprobante_falso' }),
      { code: UNIQUE_VIOLATION },
    );
    await openDispute(id, ctx.group.ownerId, applicantId, {
      kind: 'comprobante_falso',
      description: 'El comprobante recibido no corresponde a ningún pago',
    });
    assert.equal(await count('join_disputes', 'request_id = $1', [id]), 2);
  });

  test('RF-010-21: opened_by igual a accused_id falla', async () => {
    const { id, applicantId } = await disputedRequest();
    await rejectsWith(openDispute(id, applicantId, applicantId), { code: CHECK_VIOLATION });
  });

  test('RF-010-21, CA-010-46: kind, descripción y evidencia fuera de lo permitido fallan', async () => {
    const { id, applicantId } = await disputedRequest();
    const owner = ctx.group.ownerId;
    await rejectsWith(openDispute(id, applicantId, owner, { kind: 'otro' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(openDispute(id, applicantId, owner, { description: '  muy corto ' }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(openDispute(id, applicantId, owner, { description: 'x'.repeat(501) }), {
      code: CHECK_VIOLATION,
    });
    await rejectsWith(
      openDispute(id, applicantId, owner, {
        evidence_key: 'join-disputes/ficticio/1.pdf',
        evidence_mime: 'application/pdf',
      }),
      { code: CHECK_VIOLATION },
    );
    assert.equal(await count('join_disputes', 'request_id = $1', [id]), 0);
  });

  test('RF-010-22: la respuesta se fija una vez; una segunda respuesta falla', async () => {
    const { id, applicantId } = await disputedRequest();
    const disputeId = await openDispute(id, applicantId, ctx.group.ownerId);
    await rejectsWith(
      updateRow('join_disputes', disputeId, { response_text: 'Nunca recibí el dinero' }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      updateRow('join_disputes', disputeId, { response_text: 'corta', responded_at: new Date() }),
      { code: CHECK_VIOLATION },
    );
    await updateRow('join_disputes', disputeId, {
      response_text: 'Nunca recibí el dinero en mi cuenta',
      responded_at: new Date(),
    });
    const beforeRow = await snapshot('join_disputes', disputeId);
    await rejectsByTrigger(
      updateRow('join_disputes', disputeId, {
        response_text: 'Cambio mi respuesta por otra distinta',
        responded_at: new Date(),
      }),
    );
    await rejectsByTrigger(
      updateRow('join_disputes', disputeId, { response_text: null, responded_at: null }),
    );
    assert.deepEqual(await snapshot('join_disputes', disputeId), beforeRow);
  });

  test('RN-010-08, RF-010-24: resuelto exige resolución, motivo de 10 a 300 caracteres, autor y fecha', async () => {
    const { id, applicantId } = await disputedRequest();
    const disputeId = await openDispute(id, applicantId, ctx.group.ownerId);
    const adminId = await newUserId();
    const resolution: Row = {
      status: 'resuelto',
      resolution: 'sin_falta',
      resolution_reason: 'No hay evidencia del pago informado',
      resolved_by: adminId,
      resolved_at: new Date(),
    };
    for (const missing of ['resolution', 'resolution_reason', 'resolved_by', 'resolved_at']) {
      await rejectsWith(updateRow('join_disputes', disputeId, { ...resolution, [missing]: null }), {
        code: CHECK_VIOLATION,
      });
    }
    await rejectsWith(
      updateRow('join_disputes', disputeId, { ...resolution, resolution: 'parcial' }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      updateRow('join_disputes', disputeId, { ...resolution, resolution_reason: 'corto' }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(
      updateRow('join_disputes', disputeId, { ...resolution, resolution_reason: 'x'.repeat(301) }),
      { code: CHECK_VIOLATION },
    );
    await rejectsWith(updateRow('join_disputes', disputeId, { status: 'cerrado' }), {
      code: CHECK_VIOLATION,
    });
    const [row] = await run('SELECT status FROM join_disputes WHERE id = $1', [disputeId]);
    assert.equal(row?.status, 'abierto');
  });

  test('RN-010-08: un reclamo resuelto no se puede cambiar', async () => {
    const { id, applicantId } = await disputedRequest();
    const disputeId = await openDispute(id, applicantId, ctx.group.ownerId);
    const adminId = await newUserId();
    await updateRow('join_disputes', disputeId, {
      status: 'resuelto',
      resolution: 'sin_falta',
      resolution_reason: 'No hay evidencia del pago informado',
      resolved_by: adminId,
      resolved_at: new Date(),
    });
    const beforeRow = await snapshot('join_disputes', disputeId);
    await rejectsByTrigger(
      updateRow('join_disputes', disputeId, { resolution: 'estafa_confirmada' }),
    );
    await rejectsByTrigger(
      updateRow('join_disputes', disputeId, {
        resolution_reason: 'Otro motivo distinto del original',
      }),
    );
    await rejectsByTrigger(
      updateRow('join_disputes', disputeId, {
        status: 'abierto',
        resolution: null,
        resolution_reason: null,
        resolved_by: null,
        resolved_at: null,
      }),
    );
    assert.deepEqual(await snapshot('join_disputes', disputeId), beforeRow);
  });

  test('RF-010-21: un reclamo de una solicitud o persona inexistente falla', async () => {
    const { id, applicantId } = await disputedRequest();
    await rejectsWith(openDispute(MISSING_ID, applicantId, ctx.group.ownerId), {
      code: FK_VIOLATION,
    });
    await rejectsWith(openDispute(id, applicantId, MISSING_ID), { code: FK_VIOLATION });
  });
});

// ================================================================ convención de la spec 000

describe('convención de la spec 000: id y marcas de tiempo (H2, M1)', () => {
  const tables = [
    'join_requests',
    'join_request_events',
    'join_messages',
    'join_request_reads',
    'join_disputes',
  ];

  for (const table of tables) {
    test(`H2, M1: ${table} tiene id uuid como PK y created_at, updated_at timestamptz NOT NULL`, async () => {
      const columns = await run<{ column_name: string; data_type: string; is_nullable: string }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
           AND column_name IN ('id', 'created_at', 'updated_at')
         ORDER BY column_name`,
        [table],
      );
      assert.deepEqual(columns, [
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);
      const [pk] = await run<{ columns: string }>(
        `SELECT string_agg(a.attname, ',') AS columns
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [table],
      );
      assert.equal(pk?.columns, 'id');
    });
  }
});
