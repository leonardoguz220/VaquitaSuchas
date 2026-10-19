// Spec 005 (data-model.md §1 y §3): integridad de notifications (0070), parte A del MVP.
// Cada restricción se prueba intentando violarla. Todos los datos son ficticios: la CI cifrada es
// un bytea arbitrario, las huellas son HMAC con una clave de prueba y el hash de contraseña no
// corresponde a ninguna contraseña real.
//
// Las pruebas de las partes B y C (notification_deliveries: un envío por canal y notificación,
// `skipped` sin motivo, `sent` no vuelve a `pending`, 5 intentos; notification_preferences: una
// fila por usuario) se agregan en T017 y T029.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const FK_VIOLATION = '23503';

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';

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

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

function run<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
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

// ---------------------------------------------------------------- usuarios de prueba

// Cada usuario de prueba recibe valores únicos para que las pruebas no choquen entre sí.
let sequence = 0;

function defaultUser(): Record<string, unknown> {
  sequence += 1;
  const n = sequence;
  const email = `notif${n}@example.com`;
  return {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${2000000 + n}`),
    phone_e164: `+5916${String(n).padStart(7, '0')}`,
    telegram_user_id: String(800000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
  };
}

async function newUserId(overrides: Record<string, unknown> = {}): Promise<string> {
  const values = { ...defaultUser(), ...overrides };
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const [row] = await run<{ id: string }>(
    `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  assert.ok(row);
  return row.id;
}

// ---------------------------------------------------------------- notificaciones de prueba

let dedupeSequence = 0;

function dedupeKey(): string {
  dedupeSequence += 1;
  return `cobro_generado:${randomUUID()}:${dedupeSequence}`;
}

function defaultNotification(userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    type: 'cobro_generado',
    category: 'recordatorios',
    title: 'Tu cobro de noviembre está listo',
    body: 'Tu cuota de Netflix es Bs 25,50.',
    link: `/cobros/${randomUUID()}`,
    entity_type: 'charge',
    entity_id: randomUUID(),
    dedupe_key: dedupeKey(),
  };
}

function insertNotification(values: Record<string, unknown>): Promise<{ id: string }[]> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  return run<{ id: string }>(
    `INSERT INTO notifications (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
}

async function newNotification(
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; userId: string }> {
  const userId = (overrides.user_id as string | undefined) ?? (await newUserId());
  const [row] = await insertNotification({ ...defaultNotification(userId), ...overrides });
  assert.ok(row);
  return { id: row.id, userId };
}

interface NotificationSnapshot {
  [key: string]: unknown;
}

async function snapshot(id: string): Promise<NotificationSnapshot> {
  const [row] = await run<NotificationSnapshot>(
    `SELECT user_id, type, category, title, body, link, entity_type, entity_id, dedupe_key,
            read_at, created_at
     FROM notifications WHERE id = $1`,
    [id],
  );
  assert.ok(row, 'la notificación no existe');
  return row;
}

// ---------------------------------------------------------------- dedupe_key

test('RNF-005-01, CA-005-10: dos notificaciones con la misma dedupe_key fallan', async () => {
  const userId = await newUserId();
  const key = dedupeKey();
  await insertNotification({ ...defaultNotification(userId), dedupe_key: key });
  await rejectsWith(insertNotification({ ...defaultNotification(userId), dedupe_key: key }), {
    code: UNIQUE_VIOLATION,
    constraint: 'notifications_dedupe_key_key',
  });
});

test('RNF-005-01, CA-005-10: la misma dedupe_key falla también para otro destinatario', async () => {
  const key = dedupeKey();
  await insertNotification({ ...defaultNotification(await newUserId()), dedupe_key: key });
  await rejectsWith(
    insertNotification({ ...defaultNotification(await newUserId()), dedupe_key: key }),
    { code: UNIQUE_VIOLATION, constraint: 'notifications_dedupe_key_key' },
  );
});

test('RNF-005-01, CA-005-10: INSERT ... ON CONFLICT (dedupe_key) DO NOTHING no duplica', async () => {
  const userId = await newUserId();
  const key = dedupeKey();
  for (let i = 0; i < 2; i += 1) {
    await run(
      `INSERT INTO notifications (user_id, type, category, title, body, dedupe_key)
       VALUES ($1, 'cobro_generado', 'recordatorios', 'Título', 'Texto', $2)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [userId, key],
    );
  }
  const [row] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = $1',
    [key],
  );
  assert.equal(row?.n, 1);
});

// ---------------------------------------------------------------- contenido inmutable

test('integridad: notifications_immutable_content impide editar cada columna de contenido', async () => {
  const otherUserId = await newUserId();
  const changes: Record<string, unknown> = {
    type: 'cobro_vencido',
    category: 'grupo',
    title: 'Otro título',
    body: 'Otro texto',
    link: '/grupos/otro',
    entity_type: 'group',
    entity_id: randomUUID(),
    dedupe_key: dedupeKey(),
    user_id: otherUserId,
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: randomUUID(),
  };
  for (const [column, value] of Object.entries(changes)) {
    const { id } = await newNotification();
    const before = await snapshot(id);
    await assert.rejects(
      run(`UPDATE notifications SET ${column} = $1 WHERE id = $2`, [value, id]),
      (error: unknown) => (error as { code?: string }).code === '23001',
      `editar ${column} debería fallar con restrict_violation`,
    );
    assert.deepEqual(await snapshot(id), before, `${column} no debería cambiar`);
  }
});

test('integridad: pasar link, entity_type o entity_id a NULL también falla', async () => {
  for (const column of ['link', 'entity_type', 'entity_id']) {
    const { id } = await newNotification();
    const before = await snapshot(id);
    await assert.rejects(
      run(`UPDATE notifications SET ${column} = NULL WHERE id = $1`, [id]),
      (error: unknown) => (error as { code?: string }).code === '23001',
      `vaciar ${column} debería fallar con restrict_violation`,
    );
    assert.deepEqual(await snapshot(id), before, `${column} no debería cambiar`);
  }
});

test('RF-005-02: marcar read_at pasa y actualiza updated_at', async () => {
  const { id } = await newNotification({ updated_at: new Date('2020-01-01T00:00:00Z') });
  const [beforeRow] = await run<{ updated_at: Date }>(
    'SELECT updated_at FROM notifications WHERE id = $1',
    [id],
  );
  const readAt = new Date(Date.now() + 1000);
  await run('UPDATE notifications SET read_at = $1 WHERE id = $2', [readAt, id]);
  const [row] = await run<{ read_at: Date | null; updated_at: Date }>(
    'SELECT read_at, updated_at FROM notifications WHERE id = $1',
    [id],
  );
  assert.equal(row?.read_at?.toISOString(), readAt.toISOString());
  assert.ok(beforeRow && row && row.updated_at > beforeRow.updated_at);
});

test('integridad: el disparador no impide volver read_at a NULL (el contrato no lo expone)', async () => {
  const { id } = await newNotification({ read_at: new Date() });
  await run('UPDATE notifications SET read_at = NULL WHERE id = $1', [id]);
  const [row] = await run<{ read_at: Date | null }>(
    'SELECT read_at FROM notifications WHERE id = $1',
    [id],
  );
  assert.equal(row?.read_at, null);
});

test('RF-005-02: marcar todas las de un usuario como leídas pasa', async () => {
  const userId = await newUserId();
  await newNotification({ user_id: userId });
  await newNotification({ user_id: userId });
  await run('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [
    userId,
  ]);
  const [row] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  assert.equal(row?.n, 0);
});

// ---------------------------------------------------------------- link

test('RNF-005-02: un link que no empieza con / falla', async () => {
  const userId = await newUserId();
  for (const link of ['cobros/1', '//evil.com', 'https://x']) {
    await rejectsWith(insertNotification({ ...defaultNotification(userId), link }), {
      code: CHECK_VIOLATION,
      constraint: 'notifications_link_check',
    });
  }
});

test('RNF-005-02: un link interno o NULL pasa', async () => {
  const userId = await newUserId();
  await insertNotification({ ...defaultNotification(userId), link: '/cobros/abc' });
  await insertNotification({ ...defaultNotification(userId), link: null });
});

// ---------------------------------------------------------------- category, title, body

test('RF-005-17: category fuera de los cuatro valores falla', async () => {
  const userId = await newUserId();
  for (const category of ['seguridad', 'Recordatorios', '']) {
    await rejectsWith(insertNotification({ ...defaultNotification(userId), category }), {
      code: CHECK_VIOLATION,
      constraint: 'notifications_category_check',
    });
  }
});

test('RF-005-17: las cuatro categorías válidas pasan', async () => {
  const userId = await newUserId();
  for (const category of ['recordatorios', 'resoluciones', 'titular', 'grupo']) {
    await insertNotification({ ...defaultNotification(userId), category });
  }
});

test('RF-005-01: title vacío o de 121 caracteres falla; de 1 y 120 pasa', async () => {
  const userId = await newUserId();
  for (const title of ['', 'a'.repeat(121)]) {
    await rejectsWith(insertNotification({ ...defaultNotification(userId), title }), {
      code: CHECK_VIOLATION,
      constraint: 'notifications_title_check',
    });
  }
  await insertNotification({ ...defaultNotification(userId), title: 'a' });
  await insertNotification({ ...defaultNotification(userId), title: 'a'.repeat(120) });
});

test('RF-005-01: body de 501 caracteres falla; de 500 pasa', async () => {
  const userId = await newUserId();
  await rejectsWith(insertNotification({ ...defaultNotification(userId), body: 'b'.repeat(501) }), {
    code: CHECK_VIOLATION,
    constraint: 'notifications_body_check',
  });
  await insertNotification({ ...defaultNotification(userId), body: 'b'.repeat(500) });
});

test('RF-005-01: user_id, type, category, title, body y dedupe_key son obligatorios', async () => {
  const userId = await newUserId();
  for (const column of ['user_id', 'type', 'category', 'title', 'body', 'dedupe_key']) {
    await rejectsWith(insertNotification({ ...defaultNotification(userId), [column]: null }), {
      code: NOT_NULL_VIOLATION,
      column,
    });
  }
});

// ---------------------------------------------------------------- user_id

test('RF-005-01: una notificación de un usuario inexistente falla', async () => {
  await rejectsWith(
    insertNotification(defaultNotification('00000000-0000-4000-8000-000000000000')),
    {
      code: FK_VIOLATION,
      constraint: 'notifications_user_id_fkey',
    },
  );
});

test('RF-005-01: borrar un usuario con notificaciones falla (ON DELETE RESTRICT)', async () => {
  const { userId } = await newNotification();
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [userId]), {
    code: FK_VIOLATION,
    constraint: 'notifications_user_id_fkey',
  });
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

test('RF-005-01: notifications_user_idx indexa (user_id, created_at DESC)', async () => {
  const def = await indexdef('notifications_user_idx');
  assert.ok(def.endsWith('ON public.notifications USING btree (user_id, created_at DESC)'), def);
});

test('RF-005-02: notifications_unread_idx indexa las no leídas por usuario', async () => {
  const def = await indexdef('notifications_unread_idx');
  assert.ok(
    def.endsWith('ON public.notifications USING btree (user_id) WHERE (read_at IS NULL)'),
    def,
  );
});

test('RN-005-02: notifications_entity_idx indexa (entity_type, entity_id)', async () => {
  const def = await indexdef('notifications_entity_idx');
  assert.ok(def.endsWith('ON public.notifications USING btree (entity_type, entity_id)'), def);
});

test('RF-005-21: notifications_purge_idx indexa created_at', async () => {
  const def = await indexdef('notifications_purge_idx');
  assert.ok(def.endsWith('ON public.notifications USING btree (created_at)'), def);
});

// ---------------------------------------------------------------- limpieza

test('RF-005-21: la limpieza a 90 días borra las notificaciones viejas y conserva las recientes', async () => {
  const userId = await newUserId();
  const old = await newNotification({
    user_id: userId,
    created_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
  });
  const recent = await newNotification({ user_id: userId });

  await run(
    "DELETE FROM notifications WHERE user_id = $1 AND created_at < now() - interval '90 days'",
    [userId],
  );

  const rows = await run<{ id: string }>('SELECT id FROM notifications WHERE user_id = $1', [
    userId,
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    [recent.id],
  );
  assert.notEqual(old.id, recent.id);
});
