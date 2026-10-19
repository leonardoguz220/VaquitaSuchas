// Spec 008 (data-model.md §1 y §3): integridad de listings (0080), listing_reports (0081) y de
// la FK join_requests.listing_id y los disparadores de 0082. Cada restricción se prueba intentando
// violarla. Todos los datos son ficticios.
//
// Pruebas primero (T001): hasta que existan 0080-0082 este archivo falla por relaciones
// inexistentes.
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

async function inTransaction<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
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
  const sets = columns.map((column, i) => `${column} = $${i + 2}`);
  await run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...Object.values(patch)]);
}

// ---------------------------------------------------------------- usuarios y grupos

let sequence = 0;

function newUserId(): Promise<string> {
  sequence += 1;
  const n = sequence;
  const email = `listing${n}@example.com`;
  return insertRow('users', {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${6000000 + n}`),
    phone_e164: `+5916${String(n + 700).padStart(7, '0')}`,
    telegram_user_id: String(400000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  });
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let codeSequence = 0;

function nextInviteCode(): string {
  codeSequence += 1;
  let n = codeSequence + 52361;
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

// Miembro que entra por una solicitud ya cerrada (0055 exige join_request_id); la solicitud se
// inserta con session_replication_role = replica solo en esa transacción.
async function addMember(groupId: string): Promise<string> {
  const userId = await newUserId();
  const requestId = await inTransaction(async (tx) => {
    await tx.query("SET LOCAL session_replication_role = 'replica'");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO join_requests
         (group_id, applicant_id, opened_at, open_deadline_at, status, final_at, final_reason)
       VALUES ($1, $2, now(), now() + interval '24 hours', 'expirada', now(), 'plazo_solicitud')
       RETURNING id`,
      [groupId, userId],
    );
    return rows[0]?.id;
  });
  await insertRow('group_members', {
    group_id: groupId,
    user_id: userId,
    role: 'miembro',
    join_source: 'solicitud',
    join_request_id: requestId,
  });
  return userId;
}

// ---------------------------------------------------------------- publicaciones

function listingValues(groupId: string, overrides: Row = {}): Row {
  return {
    group_id: groupId,
    slots_offered: 2,
    description: 'Cupo en un plan familiar',
    published_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function insertListing(groupId: string, overrides: Row = {}): Promise<string> {
  return insertRow('listings', listingValues(groupId, overrides));
}

async function listing(id: string): Promise<{ status: string; version: number } & Row> {
  const [row] = await run<{ status: string; version: number }>(
    'SELECT status, version FROM listings WHERE id = $1',
    [id],
  );
  assert.ok(row);
  return row;
}

// Cambios de estado con las columnas que exigen los CHECK de coherencia.
const TO_STATUS: Readonly<Record<string, Row>> = {
  activa: { status: 'activa', hidden_at: null },
  oculta: { status: 'oculta', hidden_at: new Date() },
  expirada: { status: 'expirada', hidden_at: null },
  retirada: { status: 'retirada', hidden_at: null, ended_at: new Date(), end_reason: 'titular' },
  cerrada: {
    status: 'cerrada',
    hidden_at: null,
    slots_offered: 0,
    ended_at: new Date(),
    end_reason: 'cupos_completos',
  },
};

function moveTo(id: string, status: string): Promise<void> {
  const patch = TO_STATUS[status];
  assert.ok(patch);
  return updateRow('listings', id, patch);
}

async function listingIn(status: string): Promise<{ id: string; group: CreatedGroup }> {
  const group = await createGroup();
  const id = await insertListing(group.id);
  if (status !== 'activa') await moveTo(id, status);
  return { id, group };
}

// ================================================================ listings (0080)

test('RF-008-01: una publicación válida nace activa con version 1', async () => {
  const group = await createGroup();
  const id = await insertListing(group.id);
  assert.deepEqual(await listing(id), { status: 'activa', version: 1 });
});

test('CA-008-02: publicar en un grupo lleno falla', async () => {
  const group = await createGroup({ total_slots: 2 });
  await addMember(group.id);
  await rejectsWith(insertListing(group.id, { slots_offered: 1 }), { code: CHECK_VIOLATION });
});

test('CA-008-02: ofrecer más cupos que los libres falla; ofrecer todos los libres pasa', async () => {
  const group = await createGroup({ total_slots: 4 });
  await addMember(group.id);
  await rejectsWith(insertListing(group.id, { slots_offered: 3 }), { code: CHECK_VIOLATION });
  await insertListing(group.id, { slots_offered: 2 });
});

test('CA-008-02: publicar en un grupo cerrado, congelado o que no recibe miembros falla', async () => {
  const closed = await createGroup();
  await updateRow('groups', closed.id, { status: 'cerrado', closed_at: new Date() });
  const frozen = await createGroup();
  await updateRow('groups', frozen.id, { frozen_at: new Date(), frozen_reason: 'titular_baneado' });
  const notAccepting = await createGroup();
  await updateRow('groups', notAccepting.id, { accepting_members: false });
  for (const group of [closed, frozen, notAccepting]) {
    await rejectsWith(insertListing(group.id), { code: CHECK_VIOLATION });
  }
});

test('CA-008-03: dos publicaciones activas u ocultas del mismo grupo fallan', async () => {
  const group = await createGroup();
  const first = await insertListing(group.id);
  await rejectsWith(insertListing(group.id), {
    code: UNIQUE_VIOLATION,
    constraint: 'listings_group_active_uq',
  });
  await moveTo(first, 'oculta');
  await rejectsWith(insertListing(group.id), {
    code: UNIQUE_VIOLATION,
    constraint: 'listings_group_active_uq',
  });
});

test('CA-008-03: una expirada no bloquea otra activa, y renovar la expirada con otra activa falla', async () => {
  const { id: expired, group } = await listingIn('expirada');
  await insertListing(group.id);
  await rejectsWith(moveTo(expired, 'activa'), {
    code: UNIQUE_VIOLATION,
    constraint: 'listings_group_active_uq',
  });
});

test('CA-008-11: slots_offered 0 fuera de cerrada falla; 20 falla', async () => {
  const group = await createGroup({ total_slots: 20 });
  await rejectsWith(insertListing(group.id, { slots_offered: 0 }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_slots_offered_open_check',
  });
  await rejectsWith(insertListing(group.id, { slots_offered: 20 }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_slots_offered_check',
  });
});

test('RN-008-07: description o conditions de 301 caracteres fallan; de 300 pasan', async () => {
  const group = await createGroup();
  for (const column of ['description', 'conditions']) {
    await rejectsWith(insertListing(group.id, { [column]: 'a'.repeat(301) }), {
      code: CHECK_VIOLATION,
      constraint: `listings_${column}_check`,
    });
  }
  await insertListing(group.id, { description: 'a'.repeat(300), conditions: 'a'.repeat(300) });
});

test('RF-008-01: un estado fuera de la lista falla', async () => {
  const group = await createGroup();
  await rejectsWith(insertListing(group.id, { status: 'pausada' }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_status_check',
  });
});

test('RF-008-05: expires_at igual o anterior a published_at falla', async () => {
  const group = await createGroup();
  const now = new Date();
  await rejectsWith(insertListing(group.id, { published_at: now, expires_at: now }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_expires_at_check',
  });
});

test('RF-008-05: retirada o cerrada sin ended_at y end_reason fallan; ended_at en activa falla', async () => {
  const { id } = await listingIn('activa');
  await rejectsWith(updateRow('listings', id, { status: 'retirada' }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_ended_check',
  });
  await rejectsWith(updateRow('listings', id, { ended_at: new Date(), end_reason: 'titular' }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_ended_check',
  });
});

test('RF-008-18: oculta sin hidden_at falla; hidden_at en activa falla', async () => {
  const { id } = await listingIn('activa');
  await rejectsWith(updateRow('listings', id, { status: 'oculta' }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_hidden_at_check',
  });
  await rejectsWith(updateRow('listings', id, { hidden_at: new Date() }), {
    code: CHECK_VIOLATION,
    constraint: 'listings_hidden_at_check',
  });
});

test('RF-008-01: publicar en un grupo inexistente falla', async () => {
  await rejectsWith(insertListing(MISSING_ID), { code: FK_VIOLATION });
});

// ---------------------------------------------------------------- transiciones (0082)

const VALID = [
  ['activa', 'oculta'],
  ['activa', 'expirada'],
  ['activa', 'retirada'],
  ['activa', 'cerrada'],
  ['oculta', 'activa'],
  ['oculta', 'retirada'],
  ['oculta', 'cerrada'],
  ['expirada', 'activa'],
  ['expirada', 'retirada'],
] as const;

const INVALID = [
  ['oculta', 'expirada'],
  ['expirada', 'oculta'],
  ['expirada', 'cerrada'],
  ['cerrada', 'activa'],
  ['retirada', 'oculta'],
  ['retirada', 'activa'],
] as const;

test('RF-008-05, RF-008-18: las transiciones permitidas pasan y suben version en 1', async () => {
  for (const [from, to] of VALID) {
    const { id } = await listingIn(from);
    const before = (await listing(id)).version;
    await moveTo(id, to);
    const after = await listing(id);
    assert.equal(after.status, to, `${from} -> ${to}`);
    assert.equal(after.version, before + 1, `${from} -> ${to}`);
  }
});

test('RF-008-05: las transiciones no permitidas fallan', async () => {
  for (const [from, to] of INVALID) {
    const { id } = await listingIn(from);
    await rejectsWith(moveTo(id, to), { code: CHECK_VIOLATION });
    assert.equal((await listing(id)).status, from, `${from} -> ${to}`);
  }
});

test('RF-008-05: una publicación retirada o cerrada no cambia', async () => {
  for (const status of ['retirada', 'cerrada']) {
    const { id } = await listingIn(status);
    await rejectsWith(updateRow('listings', id, { description: 'Otra descripción' }), {
      code: RESTRICT_VIOLATION,
    });
  }
});

test('RF-008-05: renovar una expirada en un grupo que se llenó falla', async () => {
  const group = await createGroup({ total_slots: 3 });
  const id = await insertListing(group.id, { slots_offered: 2 });
  await moveTo(id, 'expirada');
  await addMember(group.id);
  await rejectsWith(moveTo(id, 'activa'), { code: CHECK_VIOLATION });
});

test('RF-008-14: bajar slots_offered en una activa pasa sin cambiar el estado', async () => {
  const { id } = await listingIn('activa');
  await updateRow('listings', id, { slots_offered: 1 });
  assert.equal((await listing(id)).status, 'activa');
});

// ================================================================ listing_reports (0081)

function reportValues(listingId: string, reporterId: string, overrides: Row = {}): Row {
  return { listing_id: listingId, reporter_id: reporterId, reason: 'spam', ...overrides };
}

test('RF-008-17: los cuatro motivos se aceptan y uno fuera de la lista falla', async () => {
  const { id } = await listingIn('activa');
  for (const reason of ['spam', 'datos_falsos', 'conducta_indebida', 'otro']) {
    await insertRow('listing_reports', reportValues(id, await newUserId(), { reason }));
  }
  await rejectsWith(
    insertRow('listing_reports', reportValues(id, await newUserId(), { reason: 'enganoso' })),
    { code: CHECK_VIOLATION, constraint: 'listing_reports_reason_check' },
  );
});

test('CA-008-18: un segundo reporte del mismo usuario a la misma publicación falla', async () => {
  const { id } = await listingIn('activa');
  const reporter = await newUserId();
  await insertRow('listing_reports', reportValues(id, reporter));
  await rejectsWith(insertRow('listing_reports', reportValues(id, reporter)), {
    code: UNIQUE_VIOLATION,
    constraint: 'listing_reports_listing_id_reporter_id_key',
  });
});

test('CA-008-18: el titular no puede reportar su propia publicación', async () => {
  const { id, group } = await listingIn('activa');
  await rejectsWith(insertRow('listing_reports', reportValues(id, group.ownerId)), {
    code: CHECK_VIOLATION,
  });
});

test('RF-008-17: un comentario de 301 caracteres falla; de 300 pasa', async () => {
  const { id } = await listingIn('activa');
  await rejectsWith(
    insertRow('listing_reports', reportValues(id, await newUserId(), { comment: 'a'.repeat(301) })),
    { code: CHECK_VIOLATION, constraint: 'listing_reports_comment_check' },
  );
  await insertRow(
    'listing_reports',
    reportValues(id, await newUserId(), { comment: 'a'.repeat(300) }),
  );
});

test('RNF-008-06: UPDATE y DELETE de un reporte fallan', async () => {
  const { id } = await listingIn('activa');
  const reportId = await insertRow('listing_reports', reportValues(id, await newUserId()));
  await rejectsWith(updateRow('listing_reports', reportId, { reason: 'otro' }), {
    code: RESTRICT_VIOLATION,
  });
  await rejectsWith(run('DELETE FROM listing_reports WHERE id = $1', [reportId]), {
    code: RESTRICT_VIOLATION,
  });
});

test('RF-008-17: un reporte de una publicación o de un usuario inexistente falla', async () => {
  const { id } = await listingIn('activa');
  await rejectsWith(insertRow('listing_reports', reportValues(MISSING_ID, await newUserId())), {
    code: FK_VIOLATION,
    constraint: 'listing_reports_listing_id_fkey',
  });
  await rejectsWith(insertRow('listing_reports', reportValues(id, MISSING_ID)), {
    code: FK_VIOLATION,
    constraint: 'listing_reports_reporter_id_fkey',
  });
});

// ================================================================ join_requests.listing_id (0082)

function requestValues(groupId: string, applicantId: string, listingId: string): Row {
  return {
    group_id: groupId,
    applicant_id: applicantId,
    source: 'publicacion',
    listing_id: listingId,
    opened_at: new Date(),
    open_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

test('RF-008-02: una solicitud con listing_id inexistente falla; con una publicación válida pasa', async () => {
  const { id, group } = await listingIn('activa');
  await rejectsWith(
    insertRow('join_requests', requestValues(group.id, await newUserId(), MISSING_ID)),
    { code: FK_VIOLATION, constraint: 'join_requests_listing_id_fkey' },
  );
  await insertRow('join_requests', requestValues(group.id, await newUserId(), id));
});

// ---------------------------------------------------------------- índices

async function indexdef(name: string): Promise<string> {
  const [index] = await run<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
    [name],
  );
  assert.ok(index, `falta ${name}`);
  return index.indexdef;
}

test('RNF-008-02: los índices de búsqueda, por grupo, de reportes y de solicitudes existen', async () => {
  assert.ok(
    (await indexdef('listings_search_idx')).endsWith(
      "ON public.listings USING btree (expires_at) WHERE (status = 'activa'::text)",
    ),
  );
  assert.ok(
    (await indexdef('listings_group_idx')).endsWith(
      'ON public.listings USING btree (group_id, created_at DESC)',
    ),
  );
  assert.ok(
    (await indexdef('listing_reports_listing_idx')).endsWith(
      'ON public.listing_reports USING btree (listing_id, created_at)',
    ),
  );
  assert.ok(
    (await indexdef('join_requests_listing_idx')).endsWith(
      'ON public.join_requests USING btree (listing_id) WHERE (listing_id IS NOT NULL)',
    ),
  );
});
