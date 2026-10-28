// Spec 011 (data-model.md): integridad de shortfall_rounds, shortfall_responses y shortfall_events
// (0110). Cada restricción se prueba intentando violarla. Datos ficticios.
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
const RESTRICT_VIOLATION = '23001';
const TRIGGER_CODES = [CHECK_VIOLATION, RESTRICT_VIOLATION];
const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

type Row = Record<string, unknown>;
interface PgError {
  code?: string;
  constraint?: string;
}

const fingerprint = (value: string): string =>
  createHmac('sha256', 'test-only-key').update(value).digest('hex');
const run = <T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> =>
  queryRows<T>(db.connectionString, sql, params);

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function rejectsByTrigger(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.ok(TRIGGER_CODES.includes(error.code ?? ''), `código inesperado ${String(error.code)}`);
    return true;
  });
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

async function updateRow(table: string, id: string, patch: Row): Promise<void> {
  const columns = Object.keys(patch);
  const sets = columns.map((column, i) => `${column} = $${i + 2}`);
  await run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...Object.values(patch)]);
}

let sequence = 0;
async function newUserId(): Promise<string> {
  sequence += 1;
  const n = sequence;
  const email = `faltante${n}@example.com`;
  return insertRow('users', {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${4000000 + n}`),
    phone_e164: `+5916${String(n).padStart(7, '0')}`,
    telegram_user_id: String(800000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: '2026-10-18',
  });
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let codeSequence = 0;
function nextInviteCode(): string {
  codeSequence += 1;
  let n = codeSequence + 99991;
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (CODE_ALPHABET[n % CODE_ALPHABET.length] ?? 'A') + code;
    n = Math.floor(n / CODE_ALPHABET.length);
  }
  return code;
}

interface Fixture {
  groupId: string;
  ownerId: string;
  cycleId: string;
}

async function createFixture(): Promise<Fixture> {
  const ownerId = await newUserId();
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  let groupId: string;
  try {
    await client.query('BEGIN');
    const group = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code)
       VALUES ($1, 'Grupo de prueba', 'Servicio personalizado', 10000, 'BS', 5, 5, $2)
       RETURNING id`,
      [ownerId, nextInviteCode()],
    );
    groupId = (group.rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'titular', 'creacion')`,
      [groupId, ownerId],
    );
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
  const cycleId = await insertRow('billing_cycles', {
    group_id: groupId,
    owner_id: ownerId,
    period: '2025-03',
    cycle_type: 'regular',
    cut_date: '2025-03-05',
    due_date: '2025-03-08',
    issued_at: '2025-03-05T12:00:00Z',
    price_cents: 10000,
    currency: 'BS',
    exchange_rate: null,
    total_bs_cents: 10000,
    member_count: 4,
    base_share_cents: 2500,
    owner_share_cents: 2500,
    remainder_cents: 0,
    finalized_at: '2025-03-05T12:00:00Z',
  });
  return { groupId, ownerId, cycleId };
}

function roundValues(f: Fixture, overrides: Row = {}): Row {
  return {
    group_id: f.groupId,
    cycle_id: f.cycleId,
    period: '2025-03',
    round_number: 1,
    status: 'abierta',
    total_bs_cents: 10000,
    member_count_after: 3,
    base_share_cents: 3333,
    owner_share_cents: 3334,
    shortfall_cents: 1666,
    opened_by: f.ownerId,
    opened_at: '2025-03-10T12:00:00Z',
    respond_by: '2025-03-12T12:00:00Z',
    pay_by: '2025-03-14T12:00:00Z',
    ...overrides,
  };
}

async function openRound(f: Fixture, overrides: Row = {}): Promise<string> {
  return insertRow('shortfall_rounds', roundValues(f, overrides));
}

async function addResponse(roundId: string, overrides: Row = {}): Promise<string> {
  const userId = await newUserId();
  return insertRow('shortfall_responses', {
    round_id: roundId,
    user_id: userId,
    paid_cents: 2500,
    extra_due_cents: 833,
    ...overrides,
  });
}

describe('shortfall_rounds', () => {
  test('RF-011-05: una sola ronda abierta por grupo', async () => {
    const f = await createFixture();
    await openRound(f);
    await rejectsWith(openRound(f, { round_number: 2 }), UNIQUE_VIOLATION);
  });

  test('RF-011-05: máximo dos rondas por período y grupo', async () => {
    const f = await createFixture();
    const first = await openRound(f);
    await updateRow('shortfall_rounds', first, { status: 'cerrada', closed_at: new Date() });
    const second = await openRound(f, { round_number: 2 });
    await updateRow('shortfall_rounds', second, { status: 'cerrada', closed_at: new Date() });
    await rejectsWith(openRound(f, { round_number: 3 }), CHECK_VIOLATION);
    await rejectsWith(openRound(f, { round_number: 1 }), UNIQUE_VIOLATION);
  });

  test('RF-011-04: la diferencia debe ser positiva y los plazos ordenados', async () => {
    const f = await createFixture();
    await rejectsWith(openRound(f, { shortfall_cents: 0 }), CHECK_VIOLATION);
    await rejectsWith(openRound(f, { pay_by: '2025-03-11T12:00:00Z' }), CHECK_VIOLATION);
  });

  test('RN-011-01: la cotización no cambia después de abrir', async () => {
    const f = await createFixture();
    const id = await openRound(f);
    await rejectsByTrigger(updateRow('shortfall_rounds', id, { shortfall_cents: 1 }));
    await rejectsByTrigger(updateRow('shortfall_rounds', id, { total_bs_cents: 9000 }));
  });

  test('spec 011 §7: abierta pasa a cerrada o cancelada y ahí queda', async () => {
    const f = await createFixture();
    const id = await openRound(f);
    await updateRow('shortfall_rounds', id, { status: 'cancelada', closed_at: new Date() });
    await rejectsByTrigger(
      updateRow('shortfall_rounds', id, { status: 'abierta', closed_at: null }),
    );
    await rejectsByTrigger(updateRow('shortfall_rounds', id, { status: 'cerrada' }));
  });

  test('una ronda no abierta lleva fecha de cierre', async () => {
    const f = await createFixture();
    const id = await openRound(f);
    await rejectsWith(updateRow('shortfall_rounds', id, { status: 'cerrada' }), CHECK_VIOLATION);
  });
});

describe('shortfall_responses', () => {
  test('RN-011-01: el titular no puede ser afectado', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    await rejectsByTrigger(addResponse(roundId, { user_id: f.ownerId }));
  });

  test('una persona tiene una sola fila por ronda', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const userId = await newUserId();
    await addResponse(roundId, { user_id: userId });
    await rejectsWith(addResponse(roundId, { user_id: userId }), UNIQUE_VIOLATION);
  });

  test('RF-011-08: sin respuesta no hay pago adicional ni devolución', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    await rejectsWith(addResponse(roundId, { extra_status: 'pendiente_pago' }), CHECK_VIOLATION);
    await rejectsWith(addResponse(roundId, { refund_status: 'pendiente' }), CHECK_VIOLATION);
  });

  test('RN-011-01: la cotización de la fila no cambia', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId);
    await rejectsByTrigger(updateRow('shortfall_responses', id, { extra_due_cents: 1 }));
    await rejectsByTrigger(updateRow('shortfall_responses', id, { paid_cents: 1 }));
  });

  test('RF-011-10: cubrir, informar y confirmar el pago adicional', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId);
    await updateRow('shortfall_responses', id, {
      choice: 'cubrir',
      responded_at: new Date(),
      extra_status: 'pendiente_pago',
      extra_deadline_at: '2025-03-14T12:00:00Z',
    });
    await updateRow('shortfall_responses', id, {
      extra_status: 'informado',
      extra_method: 'qr',
      extra_reference: 'REF-1',
      extra_informed_at: new Date(),
    });
    await updateRow('shortfall_responses', id, {
      extra_status: 'confirmado',
      extra_confirmed_at: new Date(),
      extra_confirmed_by: f.ownerId,
    });
    await rejectsByTrigger(
      updateRow('shortfall_responses', id, { extra_status: 'pendiente_pago' }),
    );
  });

  test('un pago adicional no puede saltarse el informe', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId);
    await updateRow('shortfall_responses', id, {
      choice: 'cubrir',
      extra_status: 'pendiente_pago',
    });
    await rejectsByTrigger(
      updateRow('shortfall_responses', id, {
        extra_status: 'confirmado',
        extra_confirmed_at: new Date(),
        extra_confirmed_by: f.ownerId,
      }),
    );
  });

  test('RF-011-12: la devolución nace del pedido, es igual a lo pagado y se registra', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId);
    await rejectsWith(
      updateRow('shortfall_responses', id, {
        choice: 'devolucion',
        refund_status: 'pendiente',
        refund_amount_cents: 1000,
        refund_opened_at: new Date(),
        refund_due_at: new Date(),
      }),
      CHECK_VIOLATION,
    );
    await updateRow('shortfall_responses', id, {
      choice: 'devolucion',
      refund_status: 'pendiente',
      refund_amount_cents: 2500,
      refund_opened_at: new Date(),
      refund_due_at: new Date(),
    });
    await updateRow('shortfall_responses', id, {
      refund_status: 'enviada',
      refund_method: 'transferencia',
      refund_reference: 'DEV-1',
      refund_sent_at: new Date(),
    });
    await updateRow('shortfall_responses', id, {
      refund_status: 'confirmada',
      refund_confirmed_at: new Date(),
    });
    await rejectsByTrigger(updateRow('shortfall_responses', id, { refund_status: 'disputada' }));
  });

  test('RF-011-13: una devolución pendiente puede quedar disputada; una enviada, también', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId, {
      choice: 'sin_respuesta',
      refund_status: 'pendiente',
      refund_amount_cents: 2500,
      refund_opened_at: new Date(),
      refund_due_at: new Date(),
    });
    await updateRow('shortfall_responses', id, {
      refund_status: 'disputada',
      refund_disputed_at: new Date(),
      refund_dispute_reason: 'No me devolvieron nada',
    });
  });

  test('RF-011-11: un pago vencido se vuelve devolución', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await addResponse(roundId);
    await updateRow('shortfall_responses', id, {
      choice: 'cubrir',
      extra_status: 'pendiente_pago',
    });
    await updateRow('shortfall_responses', id, {
      choice: 'sin_respuesta',
      extra_status: 'vencido',
      refund_status: 'pendiente',
      refund_amount_cents: 2500,
      refund_opened_at: new Date(),
      refund_due_at: new Date(),
    });
  });
});

describe('shortfall_events', () => {
  test('RF-011-15: la línea de tiempo es de solo anexado', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    const id = await insertRow('shortfall_events', {
      round_id: roundId,
      type: 'ronda_abierta',
      actor_kind: 'usuario',
      actor_id: f.ownerId,
    });
    await rejectsByTrigger(
      run('UPDATE shortfall_events SET reason = $2 WHERE id = $1', [id, 'otro']),
    );
    await rejectsByTrigger(run('DELETE FROM shortfall_events WHERE id = $1', [id]));
  });

  test('un evento del sistema no tiene actor y uno de usuario sí', async () => {
    const f = await createFixture();
    const roundId = await openRound(f);
    await rejectsWith(
      insertRow('shortfall_events', {
        round_id: roundId,
        type: 'ronda_cerrada',
        actor_kind: 'sistema',
        actor_id: f.ownerId,
      }),
      CHECK_VIOLATION,
    );
    await insertRow('shortfall_events', {
      round_id: roundId,
      type: 'ronda_cerrada',
      actor_kind: 'sistema',
    });
  });
});
