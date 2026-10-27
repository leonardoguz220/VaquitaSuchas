// Spec 001 (data-model.md §1, §2 y §4): integridad de groups (0030), group_members (0031) y sus
// disparadores (0032). Cada restricción se prueba intentando violarla. Todos los datos son
// ficticios: usuarios de prueba con hash y CI arbitrarios y un plan de catálogo inventado.
//
// El disparador diferido groups_owner_member_consistency exige que el grupo y la fila de su
// titular se inserten en la misma transacción: createGroup hace BEGIN, INSERT, INSERT y COMMIT.
// Para los disparadores (RAISE EXCEPTION) se acepta cualquier error y se verifica el efecto.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const FK_VIOLATION = '23503';
const RESTRICT_VIOLATION = '23001';

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

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
  column?: string;
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
  expected: { code: string; constraint?: string; column?: string },
): Promise<void> {
  await assert.rejects(promise, (error: PgError) => {
    assert.equal(error.code, expected.code);
    if (expected.constraint) assert.equal(error.constraint, expected.constraint);
    if (expected.column) assert.equal(error.column, expected.column);
    return true;
  });
}

// Los disparadores rechazan con RAISE EXCEPTION: no se exige código ni mensaje.
async function rejectsAny(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise);
}

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  return client;
}

async function inTransaction<T>(
  fn: (client: pg.Client) => Promise<T>,
  existing?: pg.Client,
): Promise<T> {
  const client = existing ?? (await connect());
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
    if (!existing) await client.end();
  }
}

async function insertInto(client: pg.Client, table: string, values: Row): Promise<{ id: string }> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  const [row] = rows;
  assert.ok(row);
  return row;
}

// ---------------------------------------------------------------- usuarios ficticios

let sequence = 0;

function defaultUser(): Row {
  sequence += 1;
  const n = sequence;
  const email = `user${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${1000000 + n}`),
    phone_e164: `+5917${String(n).padStart(7, '0')}`,
    telegram_user_id: String(900000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  };
}

async function newUserId(): Promise<string> {
  const values = defaultUser();
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

// ---------------------------------------------------------------- catálogo ficticio

const PLAN_MAX_SLOTS = 6;

interface CatalogPlan {
  id: string;
  name: string;
}

let catalogSequence = 0;

async function newCatalogPlan(): Promise<CatalogPlan> {
  catalogSequence += 1;
  const n = catalogSequence;
  const [service] = await run<{ id: string }>(
    `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color)
     VALUES ($1, $2, 'video', 'https://example.com/logo.png', '#112233') RETURNING id`,
    [`servicio-ficticio-${n}`, `Servicio Ficticio ${n}`],
  );
  assert.ok(service);
  const name = `Plan Ficticio ${n}`;
  const [plan] = await run<{ id: string }>(
    `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                individual_price_cents)
     VALUES ($1, $2, $3, 1599, 'USD', $4, 999) RETURNING id`,
    [service.id, `plan-ficticio-${n}`, name, PLAN_MAX_SLOTS],
  );
  assert.ok(plan);
  return { id: plan.id, name };
}

async function catalogSnapshot(): Promise<Row> {
  const plan = await newCatalogPlan();
  return {
    catalog_plan_id: plan.id,
    service_name_snapshot: 'Servicio Ficticio',
    plan_name_snapshot: plan.name,
    logo_url_snapshot: 'https://example.com/logo.png',
    brand_color_snapshot: '#112233',
    plan_max_slots_snapshot: PLAN_MAX_SLOTS,
    individual_price_cents_snapshot: 999,
    individual_price_currency_snapshot: 'USD',
  };
}

// ---------------------------------------------------------------- grupos

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let codeSequence = 0;

function nextInviteCode(): string {
  codeSequence += 1;
  let n = codeSequence;
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (CODE_ALPHABET[n % CODE_ALPHABET.length] ?? 'A') + code;
    n = Math.floor(n / CODE_ALPHABET.length);
  }
  return code;
}

function groupValues(ownerId: string, overrides: Row): Row {
  return {
    owner_id: ownerId,
    name: 'Grupo de prueba',
    service_name_snapshot: 'Servicio personalizado',
    price_cents: 6000,
    currency: 'BS',
    billing_day: 5,
    total_slots: 5,
    invite_code: nextInviteCode(),
    ...overrides,
  };
}

interface CreatedGroup {
  id: string;
  ownerId: string;
}

// Crea un grupo válido: INSERT en groups y la fila del titular en group_members en una sola
// transacción, como exige el disparador diferido groups_owner_member_consistency.
async function createGroup(overrides: Row = {}, client?: pg.Client): Promise<CreatedGroup> {
  const ownerId = typeof overrides.owner_id === 'string' ? overrides.owner_id : await newUserId();
  return inTransaction(async (tx) => {
    const group = await insertInto(tx, 'groups', groupValues(ownerId, overrides));
    await insertInto(tx, 'group_members', {
      group_id: group.id,
      user_id: ownerId,
      role: 'titular',
      join_source: 'creacion',
    });
    return { id: group.id, ownerId };
  }, client);
}

// Inserta una fila en group_members en su propia transacción (por defecto, un miembro nuevo
// que entra por solicitud). Los overrides reemplazan o agregan columnas.
// Solicitud de ingreso mínima (spec 010) para los miembros que entran por 'solicitud': desde 0055,
// group_members exige join_request_id cuando join_source = 'solicitud'. Se inserta con
// session_replication_role = replica SOLO en esta transacción para no depender de los
// disparadores de join_requests (p. ej. rechazaría una solicitud a un grupo cerrado), así las
// pruebas siguen fallando por la regla de group_members que verifican. Los CHECK sí se aplican.
// Nace ya cerrada (expirada) porque join_requests_active_uq admite una sola solicitud activa por
// persona y grupo, y algunas pruebas hacen volver al mismo usuario.
async function newJoinRequest(groupId: string, applicantId: string): Promise<string> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO join_requests
         (group_id, applicant_id, opened_at, open_deadline_at, status, final_at, final_reason)
       VALUES ($1, $2, now(), now() + interval '24 hours', 'expirada', now(), 'plazo_solicitud')
       RETURNING id`,
      [groupId, applicantId],
    );
    await client.query('COMMIT');
    const [row] = rows;
    if (!row) throw new Error('no se creó la solicitud de prueba');
    return row.id;
  } finally {
    await client.end();
  }
}

async function addMember(groupId: string, overrides: Row = {}): Promise<string> {
  const userId = typeof overrides.user_id === 'string' ? overrides.user_id : await newUserId();
  const source = overrides.join_source ?? 'solicitud';
  const needsRequest = source === 'solicitud' && !('join_request_id' in overrides);
  const joinRequestId = needsRequest ? await newJoinRequest(groupId, userId) : undefined;
  const client = await connect();
  try {
    const row = await insertInto(client, 'group_members', {
      group_id: groupId,
      user_id: userId,
      role: 'miembro',
      join_source: 'solicitud',
      ...(joinRequestId ? { join_request_id: joinRequestId } : {}),
      ...overrides,
    });
    return row.id;
  } finally {
    await client.end();
  }
}

async function groupRow(id: string): Promise<Row | undefined> {
  const [row] = await run('SELECT * FROM groups WHERE id = $1', [id]);
  return row;
}

async function activeMembers(groupId: string): Promise<number> {
  const [row] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
    [groupId],
  );
  return row?.n ?? -1;
}

async function activeGroupsOf(ownerId: string): Promise<number> {
  const [row] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM groups WHERE owner_id = $1 AND status = 'activo'`,
    [ownerId],
  );
  return row?.n ?? -1;
}

// Dos transacciones abiertas en paralelo con clientes distintos. Devuelve cuántas confirmaron.
async function raceTwo(work: (client: pg.Client) => Promise<unknown>): Promise<number> {
  const a = await connect();
  const b = await connect();
  try {
    await a.query('BEGIN');
    await b.query('BEGIN');
    const attempt = async (client: pg.Client): Promise<void> => {
      await work(client);
      await client.query('COMMIT');
    };
    const results = await Promise.allSettled([attempt(a), attempt(b)]);
    return results.filter((result) => result.status === 'fulfilled').length;
  } finally {
    await a.query('ROLLBACK').catch(() => undefined);
    await b.query('ROLLBACK').catch(() => undefined);
    await a.end();
    await b.end();
  }
}

// ---------------------------------------------------------------- valores por defecto

test('RF-001-01, RF-001-09: un grupo válido toma los valores por defecto y su titular queda como miembro', async () => {
  const group = await createGroup();
  const row = await groupRow(group.id);
  assert.ok(row);
  assert.equal(row.status, 'activo');
  assert.equal(row.closed_at, null);
  assert.equal(row.accepting_members, true);
  assert.equal(row.version, 1);
  assert.equal(row.frozen_at, null);
  const [member] = await run<{ role: string; join_source: string; left_at: Date | null }>(
    'SELECT role, join_source, left_at FROM group_members WHERE group_id = $1',
    [group.id],
  );
  assert.equal(member?.role, 'titular');
  assert.equal(member?.join_source, 'creacion');
  assert.equal(member?.left_at, null);
});

// ---------------------------------------------------------------- moneda y total

test('CA-001-02: un precio en USD sin tipo de cambio falla y no se crea nada', async () => {
  const ownerId = await newUserId();
  await rejectsWith(createGroup({ owner_id: ownerId, currency: 'USD', price_cents: 1000 }), {
    code: CHECK_VIOLATION,
  });
  assert.equal(await activeGroupsOf(ownerId), 0);
});

test('CA-001-03: un precio en BS con tipo de cambio falla; sin tipo de cambio pasa y no lo guarda', async () => {
  await rejectsWith(createGroup({ currency: 'BS', exchange_rate: '6.96' }), {
    code: CHECK_VIOLATION,
  });
  const group = await createGroup({ currency: 'BS', price_cents: 4590 });
  const row = await groupRow(group.id);
  assert.equal(row?.exchange_rate, null);
  assert.equal(String(row?.total_bs_cents), '4590');
});

test('RN-001-04: un tipo de cambio cero o negativo falla', async () => {
  for (const rate of ['0', '-6.96']) {
    await rejectsWith(createGroup({ currency: 'USD', price_cents: 1000, exchange_rate: rate }), {
      code: CHECK_VIOLATION,
    });
  }
});

test('CA-001-04, RF-001-11: total_bs_cents se genera con redondeo al centavo, mitad hacia arriba', async () => {
  const cases: [number, string, string][] = [
    [1000, '6.96', '6960'], // USD 10,00 × 6,96 = Bs 69,60
    [333, '6.9633', '2319'], // 2318,7789 → 2319
    [5000, '6.9601', '34801'], // 34800,5 → 34801 (mitad hacia arriba)
    [250, '6.9622', '1741'], // 1740,55 → 1741
    [150, '6.9633', '1044'], // 1044,495 → 1044
  ];
  for (const [price, rate, expected] of cases) {
    const group = await createGroup({ currency: 'USD', price_cents: price, exchange_rate: rate });
    const row = await groupRow(group.id);
    assert.equal(String(row?.total_bs_cents), expected, `USD ${price} × ${rate}`);
  }
});

test('RF-001-11: total_bs_cents no se puede escribir a mano', async () => {
  await rejectsAny(createGroup({ total_bs_cents: 6000 }));
  const group = await createGroup();
  await rejectsAny(run('UPDATE groups SET total_bs_cents = 1 WHERE id = $1', [group.id]));
});

test('RF-001-11: total_bs_cents se recalcula al editar precio o tipo de cambio', async () => {
  const group = await createGroup({ currency: 'USD', price_cents: 1000, exchange_rate: '6.96' });
  await run(`UPDATE groups SET exchange_rate = 7.0000 WHERE id = $1`, [group.id]);
  assert.equal(String((await groupRow(group.id))?.total_bs_cents), '7000');
});

test('RF-001-03: price_cents cero o negativo y currency fuera de (USD, BS) fallan', async () => {
  await rejectsWith(createGroup({ price_cents: 0 }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ price_cents: -100 }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ currency: 'EUR' }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ currency: 'bs' }), { code: CHECK_VIOLATION });
});

// ---------------------------------------------------------------- límites

test('RN-001-09: un total fuera de Bs 1,00 a Bs 5.000,00 falla; los bordes pasan', async () => {
  await rejectsWith(createGroup({ price_cents: 99 }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ price_cents: 500001 }), { code: CHECK_VIOLATION });
  // USD 800,00 × 6,96 = Bs 5.568,00: el límite se mide en Bs.
  await rejectsWith(createGroup({ currency: 'USD', price_cents: 80000, exchange_rate: '6.96' }), {
    code: CHECK_VIOLATION,
  });
  // USD 0,14 × 6,96 = 97,44 → 97 centavos.
  await rejectsWith(createGroup({ currency: 'USD', price_cents: 14, exchange_rate: '6.96' }), {
    code: CHECK_VIOLATION,
  });
  await createGroup({ price_cents: 100 });
  await createGroup({ price_cents: 500000 });
});

test('RN-001-09: cupos 1 o 21 fallan; 2 y 20 pasan', async () => {
  await rejectsWith(createGroup({ total_slots: 1 }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ total_slots: 21 }), { code: CHECK_VIOLATION });
  await createGroup({ total_slots: 2 });
  await createGroup({ total_slots: 20 });
});

test('RF-001-02: día de cobro 0 o 32 falla; 1 y 31 pasan', async () => {
  await rejectsWith(createGroup({ billing_day: 0 }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ billing_day: 32 }), { code: CHECK_VIOLATION });
  await createGroup({ billing_day: 1 });
  await createGroup({ billing_day: 31 });
});

test('RF-001-01: un nombre de 1 o de 61 caracteres (sin contar espacios de borde) falla', async () => {
  await rejectsWith(createGroup({ name: 'A' }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ name: '   A   ' }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ name: 'A'.repeat(61) }), { code: CHECK_VIOLATION });
  await createGroup({ name: 'Al' });
  await createGroup({ name: 'A'.repeat(60) });
});

test('RF-001-01: los datos obligatorios NULL fallan con not_null_violation', async () => {
  const required = [
    'name',
    'service_name_snapshot',
    'price_cents',
    'currency',
    'billing_day',
    'total_slots',
    'invite_code',
  ];
  for (const column of required) {
    await rejectsWith(createGroup({ [column]: null }), { code: NOT_NULL_VIOLATION, column });
  }
});

// ---------------------------------------------------------------- código de invitación

test('RF-001-06: un código con caracteres ambiguos, minúsculas o de largo distinto falla', async () => {
  const invalid = [
    'ABCDEFG0', // cero
    'ABCDEFGO', // O
    'ABCDEFG1', // uno
    'ABCDEFGI', // I
    'ABCDEFGL', // L
    'abcdefgh', // minúsculas
    'ABCDEFG', // 7 caracteres
    'ABCDEFGHJ', // 9 caracteres
    'ABCD-FGH', // símbolo
    '',
  ];
  for (const code of invalid) {
    await rejectsWith(createGroup({ invite_code: code }), { code: CHECK_VIOLATION });
  }
  await createGroup({ invite_code: 'ZZ99XY23' });
});

test('RF-001-06: un código de invitación repetido falla', async () => {
  await createGroup({ invite_code: 'HJKMNP23' });
  await rejectsWith(createGroup({ invite_code: 'HJKMNP23' }), { code: UNIQUE_VIOLATION });
});

// ---------------------------------------------------------------- pertenencia

test('RN-001-05, CA-001-08: dos filas activas del mismo usuario en un grupo fallan', async () => {
  const group = await createGroup();
  const userId = await newUserId();
  await addMember(group.id, { user_id: userId });
  await rejectsWith(addMember(group.id, { user_id: userId }), { code: UNIQUE_VIOLATION });
  // El titular tampoco puede tener una segunda fila activa como miembro.
  await rejectsAny(addMember(group.id, { user_id: group.ownerId }));
  assert.equal(await activeMembers(group.id), 2);
});

test('RN-001-05: tras llenar left_at el mismo usuario puede volver con una fila nueva', async () => {
  const group = await createGroup();
  const userId = await newUserId();
  await addMember(group.id, { user_id: userId });
  await run(
    `UPDATE group_members SET left_at = now(), left_reason = 'abandono'
     WHERE group_id = $1 AND user_id = $2`,
    [group.id, userId],
  );
  await addMember(group.id, { user_id: userId });
  const [row] = await run<{ total: number; active: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE left_at IS NULL)::int AS active
     FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [group.id, userId],
  );
  assert.equal(row?.total, 2);
  assert.equal(row?.active, 1);
});

test('CA-001-28: un mismo usuario puede ser miembro de cualquier número de grupos', async () => {
  const userId = await newUserId();
  for (let i = 0; i < 7; i += 1) {
    const group = await createGroup();
    await addMember(group.id, { user_id: userId });
  }
  const [row] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM group_members WHERE user_id = $1 AND left_at IS NULL',
    [userId],
  );
  assert.equal(row?.n, 7);
});

// ---------------------------------------------------------------- un solo titular

test('RN-001-01: dos titulares activos en un grupo fallan', async () => {
  const group = await createGroup();
  await rejectsWith(addMember(group.id, { role: 'titular', join_source: 'creacion' }), {
    code: UNIQUE_VIOLATION,
  });
  const [row] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM group_members
     WHERE group_id = $1 AND role = 'titular' AND left_at IS NULL`,
    [group.id],
  );
  assert.equal(row?.n, 1);
});

test('RN-001-01: un grupo cuyo owner_id no tiene fila de titular falla al confirmar, no al insertar', async () => {
  const ownerId = await newUserId();
  const client = await connect();
  try {
    await client.query('BEGIN');
    const group = await insertInto(client, 'groups', groupValues(ownerId, {}));
    assert.ok(group.id, 'el INSERT en groups pasa: la comprobación es diferida');
    await rejectsAny(client.query('COMMIT'));
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
  assert.equal(await activeGroupsOf(ownerId), 0);
});

test('RN-001-01: un owner_id que solo tiene fila de miembro falla al confirmar', async () => {
  const ownerId = await newUserId();
  await rejectsAny(
    inTransaction(async (tx) => {
      const group = await insertInto(tx, 'groups', groupValues(ownerId, {}));
      await insertInto(tx, 'group_members', {
        group_id: group.id,
        user_id: ownerId,
        role: 'miembro',
        join_source: 'creacion',
      });
    }),
  );
  assert.equal(await activeGroupsOf(ownerId), 0);
});

test('RN-001-01: un titular activo distinto del owner_id falla al confirmar', async () => {
  const ownerId = await newUserId();
  const otherId = await newUserId();
  await rejectsAny(
    inTransaction(async (tx) => {
      const group = await insertInto(tx, 'groups', groupValues(ownerId, {}));
      await insertInto(tx, 'group_members', {
        group_id: group.id,
        user_id: otherId,
        role: 'titular',
        join_source: 'creacion',
      });
    }),
  );
  assert.equal(await activeGroupsOf(ownerId), 0);
});

test('RN-001-01: el titular no puede salir del grupo sin transferir la titularidad', async () => {
  const group = await createGroup();
  await rejectsAny(
    run(
      `UPDATE group_members SET left_at = now(), left_reason = 'abandono'
       WHERE group_id = $1 AND user_id = $2`,
      [group.id, group.ownerId],
    ),
  );
  assert.equal(await activeMembers(group.id), 1);
});

test('CA-001-13: transferir la titularidad en una transacción deja un único titular', async () => {
  const group = await createGroup();
  const newOwnerId = await newUserId();
  await addMember(group.id, { user_id: newOwnerId });
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
  const rows = await run<{ user_id: string; role: string }>(
    `SELECT user_id, role FROM group_members WHERE group_id = $1 AND left_at IS NULL`,
    [group.id],
  );
  const titulares = rows.filter((row) => row.role === 'titular');
  assert.equal(titulares.length, 1);
  assert.equal(titulares[0]?.user_id, newOwnerId);
  assert.equal((await groupRow(group.id))?.owner_id, newOwnerId);
});

test('CA-001-13: cambiar owner_id sin cambiar los roles falla al confirmar', async () => {
  const group = await createGroup();
  const memberId = await newUserId();
  await addMember(group.id, { user_id: memberId });
  await rejectsAny(
    inTransaction(async (tx) => {
      await tx.query('UPDATE groups SET owner_id = $2 WHERE id = $1', [group.id, memberId]);
    }),
  );
  assert.equal((await groupRow(group.id))?.owner_id, group.ownerId);
});

// ---------------------------------------------------------------- cupos

test('CA-001-07: insertar un miembro con el grupo lleno falla', async () => {
  const group = await createGroup({ total_slots: 3 });
  await addMember(group.id);
  await addMember(group.id);
  assert.equal(await activeMembers(group.id), 3);
  await rejectsAny(addMember(group.id));
  assert.equal(await activeMembers(group.id), 3);
});

test('CA-001-07, RF-001-10: las filas que ya salieron no ocupan cupo', async () => {
  const group = await createGroup({ total_slots: 2 });
  const memberId = await newUserId();
  await addMember(group.id, { user_id: memberId });
  await run(
    `UPDATE group_members SET left_at = now(), left_reason = 'quitado'
     WHERE group_id = $1 AND user_id = $2`,
    [group.id, memberId],
  );
  await addMember(group.id);
  assert.equal(await activeMembers(group.id), 2);
});

test('CA-001-16: insertar un miembro en un grupo cerrado falla', async () => {
  const group = await createGroup({ total_slots: 5 });
  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [group.id]);
  await rejectsAny(addMember(group.id));
  assert.equal(await activeMembers(group.id), 1);
});

test('CA-001-16, RF-009-22: insertar un miembro en un grupo congelado falla', async () => {
  const group = await createGroup({ total_slots: 5 });
  await run(
    `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
    [group.id],
  );
  await rejectsAny(addMember(group.id));
  assert.equal(await activeMembers(group.id), 1);
});

test('CA-001-19: dos inserciones concurrentes por el último cupo dejan solo una', async () => {
  const group = await createGroup({ total_slots: 3 });
  await addMember(group.id);
  const userA = await newUserId();
  const userB = await newUserId();
  const users = [userA, userB];
  const requests = [await newJoinRequest(group.id, userA), await newJoinRequest(group.id, userB)];
  let turn = 0;
  const committed = await raceTwo(async (client) => {
    const index = turn++;
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
       VALUES ($1, $2, 'miembro', 'solicitud', $3)`,
      [group.id, users[index], requests[index]],
    );
  });
  assert.equal(committed, 1, 'exactamente una transacción ocupa el último cupo');
  assert.equal(await activeMembers(group.id), 3);
});

test('RF-001-14: reducir total_slots por debajo de los miembros activos falla', async () => {
  const group = await createGroup({ total_slots: 4 });
  const memberId = await newUserId();
  await addMember(group.id, { user_id: memberId });
  await addMember(group.id);
  await rejectsAny(run('UPDATE groups SET total_slots = 2 WHERE id = $1', [group.id]));
  assert.equal((await groupRow(group.id))?.total_slots, 4);
  await run('UPDATE groups SET total_slots = 3 WHERE id = $1', [group.id]);
  assert.equal((await groupRow(group.id))?.total_slots, 3);
  // Quien ya salió no cuenta: con dos activos se puede bajar a 2.
  await run(
    `UPDATE group_members SET left_at = now(), left_reason = 'abandono'
     WHERE group_id = $1 AND user_id = $2`,
    [group.id, memberId],
  );
  await run('UPDATE groups SET total_slots = 2 WHERE id = $1', [group.id]);
  assert.equal((await groupRow(group.id))?.total_slots, 2);
});

// ---------------------------------------------------------------- límite de grupos

test('CA-001-28: un sexto grupo activo del mismo titular falla; cerrar uno permite crear otro', async () => {
  const ownerId = await newUserId();
  const groups: CreatedGroup[] = [];
  for (let i = 0; i < 5; i += 1) groups.push(await createGroup({ owner_id: ownerId }));
  await rejectsAny(createGroup({ owner_id: ownerId }));
  assert.equal(await activeGroupsOf(ownerId), 5);

  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [
    groups[0]?.id,
  ]);
  assert.equal(await activeGroupsOf(ownerId), 4);
  await createGroup({ owner_id: ownerId });
  assert.equal(await activeGroupsOf(ownerId), 5);
});

test('CA-001-28: dos creaciones concurrentes del quinto grupo dejan solo una', async () => {
  const ownerId = await newUserId();
  for (let i = 0; i < 4; i += 1) await createGroup({ owner_id: ownerId });
  const committed = await raceTwo(async (client) => {
    const group = await insertInto(client, 'groups', groupValues(ownerId, {}));
    await insertInto(client, 'group_members', {
      group_id: group.id,
      user_id: ownerId,
      role: 'titular',
      join_source: 'creacion',
    });
  });
  assert.equal(committed, 1, 'exactamente una transacción crea el quinto grupo');
  assert.equal(await activeGroupsOf(ownerId), 5);
});

test('RN-001-14: transferir un grupo a un titular que ya tiene 5 activos falla', async () => {
  const busyOwnerId = await newUserId();
  for (let i = 0; i < 5; i += 1) await createGroup({ owner_id: busyOwnerId });
  const group = await createGroup();
  await addMember(group.id, { user_id: busyOwnerId });
  await rejectsAny(
    inTransaction(async (tx) => {
      await tx.query(
        `UPDATE group_members SET role = 'miembro' WHERE group_id = $1 AND user_id = $2`,
        [group.id, group.ownerId],
      );
      await tx.query(
        `UPDATE group_members SET role = 'titular' WHERE group_id = $1 AND user_id = $2`,
        [group.id, busyOwnerId],
      );
      await tx.query('UPDATE groups SET owner_id = $2 WHERE id = $1', [group.id, busyOwnerId]);
    }),
  );
  assert.equal((await groupRow(group.id))?.owner_id, group.ownerId);
  assert.equal(await activeGroupsOf(busyOwnerId), 5);
});

// ---------------------------------------------------------------- copia del catálogo

test('RN-001-12: editar una columna *_snapshot o catalog_plan_id falla', async () => {
  const snapshot = await catalogSnapshot();
  const group = await createGroup({ ...snapshot, total_slots: 4 });
  const otherPlan = await newCatalogPlan();
  const edits: [string, unknown][] = [
    ['service_name_snapshot', 'Otro servicio'],
    ['plan_name_snapshot', 'Otro plan'],
    ['logo_url_snapshot', 'https://example.com/otro.png'],
    ['brand_color_snapshot', '#445566'],
    ['plan_max_slots_snapshot', 10],
    ['individual_price_cents_snapshot', 1],
    ['individual_price_currency_snapshot', 'BS'],
    ['catalog_plan_id', otherPlan.id],
  ];
  for (const [column, value] of edits) {
    await rejectsAny(run(`UPDATE groups SET ${column} = $2 WHERE id = $1`, [group.id, value]));
  }
  await rejectsAny(
    run('UPDATE groups SET catalog_plan_id = NULL, plan_name_snapshot = NULL WHERE id = $1', [
      group.id,
    ]),
  );
  const row = await groupRow(group.id);
  for (const [column, value] of Object.entries(snapshot)) {
    assert.equal(String(row?.[column]), String(value), `${column} no cambia`);
  }
});

test('RN-001-12: editar el nombre o el precio de un grupo del catálogo sí pasa', async () => {
  const group = await createGroup({ ...(await catalogSnapshot()), total_slots: 4 });
  await run(`UPDATE groups SET name = 'Grupo renombrado', price_cents = 7000 WHERE id = $1`, [
    group.id,
  ]);
  const row = await groupRow(group.id);
  assert.equal(row?.name, 'Grupo renombrado');
  assert.equal(String(row?.total_bs_cents), '7000');
});

test('RN-001-12: cambiar el plan del catálogo no cambia la copia del grupo', async () => {
  const snapshot = await catalogSnapshot();
  const group = await createGroup({ ...snapshot, total_slots: 4 });
  await run(`UPDATE catalog_plans SET name = 'Plan Cambiado', max_slots = 3 WHERE id = $1`, [
    snapshot.catalog_plan_id,
  ]);
  const row = await groupRow(group.id);
  assert.equal(row?.plan_name_snapshot, snapshot.plan_name_snapshot);
  assert.equal(row?.plan_max_slots_snapshot, PLAN_MAX_SLOTS);
});

test('RN-001-12: catalog_plan_id y plan_name_snapshot van juntos', async () => {
  const plan = await newCatalogPlan();
  await rejectsWith(createGroup({ plan_name_snapshot: 'Plan sin catálogo' }), {
    code: CHECK_VIOLATION,
  });
  await rejectsWith(createGroup({ catalog_plan_id: plan.id }), { code: CHECK_VIOLATION });
  await createGroup({ catalog_plan_id: plan.id, plan_name_snapshot: plan.name, total_slots: 4 });
});

test('RN-001-12: individual_price_currency_snapshot fuera de (USD, BS) falla', async () => {
  await rejectsWith(createGroup({ individual_price_currency_snapshot: 'EUR' }), {
    code: CHECK_VIOLATION,
  });
});

test('RN-001-12: un catalog_plan_id inexistente falla por FK', async () => {
  await rejectsWith(createGroup({ catalog_plan_id: MISSING_ID, plan_name_snapshot: 'Plan' }), {
    code: FK_VIOLATION,
  });
});

// ---------------------------------------------------------------- cupos del plan

test('RN-001-13: total_slots mayor al plan_max_slots_snapshot falla; igual pasa', async () => {
  await rejectsWith(
    createGroup({ ...(await catalogSnapshot()), total_slots: PLAN_MAX_SLOTS + 1 }),
    {
      code: CHECK_VIOLATION,
    },
  );
  const group = await createGroup({ ...(await catalogSnapshot()), total_slots: PLAN_MAX_SLOTS });
  await rejectsWith(
    run('UPDATE groups SET total_slots = $2 WHERE id = $1', [group.id, PLAN_MAX_SLOTS + 1]),
    { code: CHECK_VIOLATION },
  );
  assert.equal((await groupRow(group.id))?.total_slots, PLAN_MAX_SLOTS);
});

// ---------------------------------------------------------------- estado y cierre

test('RN-001-07: closed_at va ligado a status = cerrado', async () => {
  await rejectsWith(createGroup({ closed_at: new Date() }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ status: 'cerrado' }), { code: CHECK_VIOLATION });
  const group = await createGroup();
  await rejectsWith(run(`UPDATE groups SET status = 'cerrado' WHERE id = $1`, [group.id]), {
    code: CHECK_VIOLATION,
  });
  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [group.id]);
  assert.equal((await groupRow(group.id))?.status, 'cerrado');
});

test('RN-001-07: un status fuera de (activo, cerrado) falla', async () => {
  await rejectsWith(createGroup({ status: 'pausado' }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ status: null }), { code: NOT_NULL_VIOLATION, column: 'status' });
});

test('CA-001-16: editar un grupo cerrado falla, salvo updated_at, frozen_at y frozen_reason', async () => {
  const group = await createGroup();
  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [group.id]);
  const before = await groupRow(group.id);
  const edits: [string, unknown][] = [
    ['name', 'Otro nombre'],
    ['price_cents', 9000],
    ['billing_day', 10],
    ['total_slots', 6],
    ['accepting_members', false],
    ['payment_info_text', 'Transferir a la cuenta ficticia'],
    ['version', 2],
  ];
  for (const [column, value] of edits) {
    await rejectsAny(run(`UPDATE groups SET ${column} = $2 WHERE id = $1`, [group.id, value]));
  }
  await rejectsAny(
    run(`UPDATE groups SET status = 'activo', closed_at = NULL WHERE id = $1`, [group.id]),
  );
  const after = await groupRow(group.id);
  assert.deepEqual({ ...after, updated_at: null }, { ...before, updated_at: null });

  await run(`UPDATE groups SET updated_at = now() WHERE id = $1`, [group.id]);
});

test('CA-001-16, RF-009-22: congelar un grupo cerrado pasa; congelar junto con otro cambio falla', async () => {
  const group = await createGroup();
  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [group.id]);
  const before = await groupRow(group.id);
  // frozen_* solo puede viajar con updated_at: cualquier otra columna sigue bloqueada.
  await rejectsAny(
    run(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado', name = 'Otro nombre'
       WHERE id = $1`,
      [group.id],
    ),
  );
  assert.equal((await groupRow(group.id))?.frozen_at, null);

  await run(
    `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
    [group.id],
  );
  const after = await groupRow(group.id);
  assert.equal(after?.status, 'cerrado');
  assert.equal(after?.frozen_reason, 'titular_baneado');
  assert.ok(after?.frozen_at instanceof Date);
  const strip = (row: Row | undefined): Row => ({
    ...row,
    updated_at: null,
    frozen_at: null,
    frozen_reason: null,
  });
  assert.deepEqual(strip(after), strip(before));

  // Ya congelado y cerrado, el resto sigue en solo lectura.
  await rejectsAny(run(`UPDATE groups SET billing_day = 12 WHERE id = $1`, [group.id]));
  assert.equal((await groupRow(group.id))?.billing_day, before?.billing_day);
});

test('RF-009-22: frozen_at y frozen_reason van juntos y frozen_reason solo admite titular_baneado', async () => {
  await rejectsWith(createGroup({ frozen_at: new Date() }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ frozen_reason: 'titular_baneado' }), { code: CHECK_VIOLATION });
  await rejectsWith(createGroup({ frozen_at: new Date(), frozen_reason: 'mora' }), {
    code: CHECK_VIOLATION,
  });
  // Un grupo nace sin congelar (group_members_capacity rechazaría la fila del titular): se
  // congela después, como hace el baneo del titular (spec 009).
  const group = await createGroup();
  await rejectsWith(run(`UPDATE groups SET frozen_at = now() WHERE id = $1`, [group.id]), {
    code: CHECK_VIOLATION,
  });
  await rejectsWith(
    run(`UPDATE groups SET frozen_at = now(), frozen_reason = 'mora' WHERE id = $1`, [group.id]),
    { code: CHECK_VIOLATION },
  );
  await run(
    `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
    [group.id],
  );
  assert.equal((await groupRow(group.id))?.frozen_reason, 'titular_baneado');
});

// ---------------------------------------------------------------- datos de pago

test('RF-001-20: payment_info_text de más de 500 caracteres falla; 500 pasa', async () => {
  await rejectsWith(createGroup({ payment_info_text: 'x'.repeat(501) }), {
    code: CHECK_VIOLATION,
  });
  await createGroup({ payment_info_text: 'x'.repeat(500) });
});

test('RF-001-20: payment_qr_mime fuera de (image/jpeg, image/png) falla', async () => {
  for (const mime of ['image/gif', 'application/pdf', 'IMAGE/PNG']) {
    await rejectsWith(createGroup({ payment_qr_key: 'qr/ficticio', payment_qr_mime: mime }), {
      code: CHECK_VIOLATION,
    });
  }
  await createGroup({ payment_qr_key: 'qr/ficticio.png', payment_qr_mime: 'image/png' });
  await createGroup({ payment_qr_key: 'qr/ficticio.jpg', payment_qr_mime: 'image/jpeg' });
});

// ---------------------------------------------------------------- group_members

test('RN-001-05: left_at y left_reason van juntos', async () => {
  const group = await createGroup();
  await rejectsWith(addMember(group.id, { left_at: new Date() }), { code: CHECK_VIOLATION });
  await rejectsWith(addMember(group.id, { left_reason: 'abandono' }), { code: CHECK_VIOLATION });
  const rowId = await addMember(group.id);
  await rejectsWith(run('UPDATE group_members SET left_at = now() WHERE id = $1', [rowId]), {
    code: CHECK_VIOLATION,
  });
});

// group_members_left_immutable: una estadía cerrada no se reabre ni se reescribe; volver al
// grupo es una fila nueva. La capacidad solo se controla en INSERT (group_members_capacity).
async function closedStay(reason: string): Promise<{ groupId: string; rowId: string }> {
  const group = await createGroup({ total_slots: 5 });
  const rowId = await addMember(group.id);
  await run(`UPDATE group_members SET left_at = now(), left_reason = $2 WHERE id = $1`, [
    rowId,
    reason,
  ]);
  return { groupId: group.id, rowId };
}

async function memberRow(rowId: string): Promise<Row | undefined> {
  const [row] = await run('SELECT * FROM group_members WHERE id = $1', [rowId]);
  return row;
}

test('RN-001-05: reabrir una estadía (left_at a NULL) falla siempre, aunque haya cupo', async () => {
  const { groupId, rowId } = await closedStay('mora');
  const before = await memberRow(rowId);
  await rejectsAny(
    run('UPDATE group_members SET left_at = NULL, left_reason = NULL WHERE id = $1', [rowId]),
  );
  // El grupo tiene cupos libres (5 cupos, 1 activo): el rechazo no depende de la capacidad.
  assert.equal(await activeMembers(groupId), 1);
  assert.deepEqual(await memberRow(rowId), before);
});

test('RN-001-05: cambiar left_reason o left_at de una estadía cerrada falla', async () => {
  const { rowId } = await closedStay('abandono');
  const before = await memberRow(rowId);
  await rejectsAny(run(`UPDATE group_members SET left_reason = 'mora' WHERE id = $1`, [rowId]));
  await rejectsAny(
    run(`UPDATE group_members SET left_at = left_at - interval '1 day' WHERE id = $1`, [rowId]),
  );
  await rejectsAny(
    run(
      `UPDATE group_members SET left_at = now() + interval '1 hour', left_reason = 'baneo'
       WHERE id = $1`,
      [rowId],
    ),
  );
  assert.deepEqual(await memberRow(rowId), before);
});

// group_members_identity_immutable (0033): la capacidad, el grupo cerrado y el congelado se
// controlan al insertar, así que una estadía no puede cambiar de grupo ni de persona después.
test('CA-001-07, CA-001-16: mover una estadía a un grupo lleno o cerrado con UPDATE de group_id falla', async () => {
  const full = await createGroup({ total_slots: 2 });
  await addMember(full.id);
  const closed = await createGroup({ total_slots: 5 });
  await run(`UPDATE groups SET status = 'cerrado', closed_at = now() WHERE id = $1`, [closed.id]);
  const origin = await createGroup({ total_slots: 5 });
  const rowId = await addMember(origin.id);
  const before = await memberRow(rowId);

  for (const target of [full.id, closed.id]) {
    await rejectsWith(
      run('UPDATE group_members SET group_id = $2 WHERE id = $1', [rowId, target]),
      { code: RESTRICT_VIOLATION },
    );
  }
  assert.equal(await activeMembers(full.id), 2);
  assert.equal(await activeMembers(closed.id), 1);
  assert.deepEqual(await memberRow(rowId), before);
});

test('RN-001-05: cambiar user_id, join_source, join_request_id o joined_at de una estadía falla', async () => {
  const group = await createGroup({ total_slots: 5 });
  const rowId = await addMember(group.id);
  const otherUserId = await newUserId();
  const before = await memberRow(rowId);

  for (const [sql, params] of [
    ['UPDATE group_members SET user_id = $2 WHERE id = $1', [rowId, otherUserId]],
    [
      `UPDATE group_members SET join_source = 'creacion', join_request_id = NULL WHERE id = $1`,
      [rowId],
    ],
    [
      'UPDATE group_members SET join_request_id = $2 WHERE id = $1',
      [rowId, await newJoinRequest(group.id, otherUserId)],
    ],
    [`UPDATE group_members SET joined_at = joined_at - interval '1 day' WHERE id = $1`, [rowId]],
  ] as const) {
    await rejectsWith(run(sql, [...params]), { code: RESTRICT_VIOLATION });
  }
  assert.deepEqual(await memberRow(rowId), before);
});

test('RN-001-05: cerrar una estadía (left_at y left_reason) sigue permitido', async () => {
  const group = await createGroup({ total_slots: 5 });
  const rowId = await addMember(group.id);
  await run(`UPDATE group_members SET left_at = now(), left_reason = 'abandono' WHERE id = $1`, [
    rowId,
  ]);
  const after = await memberRow(rowId);
  assert.equal(after?.left_reason, 'abandono');
});

test('RN-001-05: role, join_source y left_reason fuera de los valores de la spec fallan', async () => {
  const group = await createGroup({ total_slots: 10 });
  await rejectsWith(addMember(group.id, { role: 'admin' }), { code: CHECK_VIOLATION });
  await rejectsWith(addMember(group.id, { join_source: 'invitacion' }), {
    code: CHECK_VIOLATION,
  });
  for (const reason of ['expulsado', 'cierre']) {
    await rejectsWith(addMember(group.id, { left_at: new Date(), left_reason: reason }), {
      code: CHECK_VIOLATION,
    });
  }
  for (const reason of ['abandono', 'quitado', 'mora', 'baneo']) {
    await addMember(group.id, { left_at: new Date(), left_reason: reason });
  }
});

test('RN-001-05: un miembro de un usuario inexistente falla por FK', async () => {
  const group = await createGroup();
  await rejectsWith(addMember(group.id, { user_id: MISSING_ID }), { code: FK_VIOLATION });
});

// ---------------------------------------------------------------- claves foráneas RESTRICT

test('RN-001-01: borrar un usuario titular falla (ON DELETE RESTRICT)', async () => {
  const group = await createGroup();
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [group.ownerId]), {
    code: FK_VIOLATION,
  });
  assert.ok(await groupRow(group.id));
});

test('RN-001-05: borrar un usuario que es miembro falla (ON DELETE RESTRICT)', async () => {
  const group = await createGroup();
  const memberId = await newUserId();
  await addMember(group.id, { user_id: memberId });
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [memberId]), { code: FK_VIOLATION });
});

test('RN-001-12: borrar un plan del catálogo usado por un grupo falla (ON DELETE RESTRICT)', async () => {
  const snapshot = await catalogSnapshot();
  await createGroup({ ...snapshot, total_slots: 4 });
  await rejectsWith(run('DELETE FROM catalog_plans WHERE id = $1', [snapshot.catalog_plan_id]), {
    code: FK_VIOLATION,
  });
});

test('RN-001-01: borrar un grupo con miembros falla (ON DELETE RESTRICT)', async () => {
  const group = await createGroup();
  await rejectsWith(run('DELETE FROM groups WHERE id = $1', [group.id]), { code: FK_VIOLATION });
});

// ---------------------------------------------------------------- updated_at

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('RF-001-14: editar un grupo actualiza updated_at (set_updated_at)', async () => {
  const group = await createGroup();
  const before = await groupRow(group.id);
  await pause(20);

  await run(`UPDATE groups SET name = 'Nombre nuevo' WHERE id = $1`, [group.id]);
  const after = await groupRow(group.id);
  assert.ok((after?.updated_at as Date).getTime() > (before?.updated_at as Date).getTime());
});

// PR #43, H2: group_members sigue la convención de la spec 000 (created_at, updated_at y
// set_updated_at). Se fija un updated_at viejo al insertar para no depender del reloj.
const OLD_TIMESTAMP = new Date('2020-01-01T00:00:00Z');

test('H2 (convención spec 000): group_members tiene created_at y updated_at NOT NULL con valor por defecto', async () => {
  const group = await createGroup();
  const rowId = await addMember(group.id);
  const row = await memberRow(rowId);
  assert.ok(row?.created_at instanceof Date, 'created_at se llena por defecto');
  assert.ok(row?.updated_at instanceof Date, 'updated_at se llena por defecto');
  await rejectsWith(addMember(group.id, { created_at: null }), {
    code: NOT_NULL_VIOLATION,
    column: 'created_at',
  });
  await rejectsWith(addMember(group.id, { updated_at: null }), {
    code: NOT_NULL_VIOLATION,
    column: 'updated_at',
  });
});

test('H2 (convención spec 000): salir del grupo (left_at, left_reason) actualiza updated_at de group_members', async () => {
  const group = await createGroup();
  const rowId = await addMember(group.id, {
    created_at: OLD_TIMESTAMP,
    updated_at: OLD_TIMESTAMP,
  });
  const before = await memberRow(rowId);
  assert.equal((before?.updated_at as Date).getTime(), OLD_TIMESTAMP.getTime());

  await run(`UPDATE group_members SET left_at = now(), left_reason = 'abandono' WHERE id = $1`, [
    rowId,
  ]);
  const after = await memberRow(rowId);
  assert.ok((after?.updated_at as Date).getTime() > OLD_TIMESTAMP.getTime());
  assert.equal(
    (after?.created_at as Date).getTime(),
    OLD_TIMESTAMP.getTime(),
    'created_at no cambia',
  );
});

test('RF-001-19: existen los índices de "mis grupos" y de miembros activos', async () => {
  const rows = await run<{ indexname: string; indexdef: string }>(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('groups', 'group_members')",
  );
  const def = (name: string): string => rows.find((row) => row.indexname === name)?.indexdef ?? '';
  assert.ok(def('group_members_user_idx').endsWith('(user_id) WHERE (left_at IS NULL)'));
  assert.ok(def('group_members_group_active_idx').endsWith('(group_id) WHERE (left_at IS NULL)'));
  assert.ok(def('groups_owner_active_idx').endsWith("(owner_id) WHERE (status = 'activo'::text)"));
});
