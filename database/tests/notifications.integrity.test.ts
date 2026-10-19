// Spec 005 (data-model.md §1 y §3): integridad de notifications (0070, parte A del MVP, T001) y
// de notification_preferences (0071), notification_deliveries (0072) y deliveries_no_resurrect
// (0074) de las partes B y C (T017). Cada restricción se prueba intentando violarla. Todos los
// datos son ficticios: la CI cifrada es un bytea arbitrario, las huellas son HMAC con una clave de
// prueba y el hash de contraseña no corresponde a ninguna contraseña real.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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

// ================================================================ partes B y C (T017)
// notification_deliveries (0072), deliveries_no_resurrect (0074) y notification_preferences (0071)
// (data-model.md §1 y §3).

// deliveries_no_resurrect usa ERRCODE restrict_violation, como forbid_update_delete().
const RESTRICT_VIOLATION = '23001';

function defaultDelivery(notificationId: string): Record<string, unknown> {
  return {
    notification_id: notificationId,
    channel: 'email',
    respect_window: true,
    next_attempt_at: new Date(),
  };
}

function insertDelivery(values: Record<string, unknown>): Promise<{ id: string }[]> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  return run<{ id: string }>(
    `INSERT INTO notification_deliveries (${columns.join(', ')})
     VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
}

async function newDelivery(overrides: Record<string, unknown> = {}): Promise<string> {
  const notificationId =
    (overrides.notification_id as string | undefined) ?? (await newNotification()).id;
  const [row] = await insertDelivery({ ...defaultDelivery(notificationId), ...overrides });
  assert.ok(row);
  return row.id;
}

function setStatus(id: string, status: string, skipReason: string | null = null): Promise<unknown> {
  return run('UPDATE notification_deliveries SET status = $1, skip_reason = $2 WHERE id = $3', [
    status,
    skipReason,
    id,
  ]);
}

async function deliveryStatus(id: string): Promise<string | undefined> {
  const [row] = await run<{ status: string }>(
    'SELECT status FROM notification_deliveries WHERE id = $1',
    [id],
  );
  return row?.status;
}

// ---------------------------------------------------------------- un envío por canal

test('RF-005-17: dos envíos del mismo canal para una notificación fallan', async () => {
  const { id } = await newNotification();
  await newDelivery({ notification_id: id, channel: 'email' });
  await rejectsWith(insertDelivery({ ...defaultDelivery(id), channel: 'email' }), {
    code: UNIQUE_VIOLATION,
    constraint: 'notification_deliveries_notification_id_channel_key',
  });
});

test('RF-005-17: un envío por correo y otro por Telegram de la misma notificación pasan', async () => {
  const { id } = await newNotification();
  await newDelivery({ notification_id: id, channel: 'email' });
  await newDelivery({ notification_id: id, channel: 'telegram' });
  const [row] = await run<{ n: number }>(
    'SELECT count(*)::int AS n FROM notification_deliveries WHERE notification_id = $1',
    [id],
  );
  assert.equal(row?.n, 2);
});

test('RF-005-20: un envío nace pending con 0 intentos', async () => {
  const id = await newDelivery();
  const [row] = await run<{ status: string; attempts: number }>(
    'SELECT status, attempts FROM notification_deliveries WHERE id = $1',
    [id],
  );
  assert.deepEqual({ ...row }, { status: 'pending', attempts: 0 });
});

// ---------------------------------------------------------------- skip_reason

test('RF-005-17: un envío skipped sin motivo falla', async () => {
  const { id } = await newNotification();
  await rejectsWith(insertDelivery({ ...defaultDelivery(id), status: 'skipped' }), {
    code: CHECK_VIOLATION,
    constraint: 'notification_deliveries_skip_reason_check',
  });
  const deliveryId = await newDelivery();
  await rejectsWith(setStatus(deliveryId, 'skipped'), {
    code: CHECK_VIOLATION,
    constraint: 'notification_deliveries_skip_reason_check',
  });
});

test('RF-005-17: un motivo de omisión con un estado distinto de skipped falla', async () => {
  const { id } = await newNotification();
  for (const status of ['pending', 'sent', 'failed']) {
    await rejectsWith(
      insertDelivery({ ...defaultDelivery(id), status, skip_reason: 'preferencia_desactivada' }),
      { code: CHECK_VIOLATION, constraint: 'notification_deliveries_skip_reason_check' },
    );
  }
});

test('RF-005-17: un envío skipped con motivo pasa', async () => {
  const id = await newDelivery({ status: 'skipped', skip_reason: 'preferencia_desactivada' });
  assert.equal(await deliveryStatus(id), 'skipped');
});

// ---------------------------------------------------------------- deliveries_no_resurrect

test('RNF-005-01: un envío sent, failed o skipped no vuelve a pending', async () => {
  const finals: [string, string | null][] = [
    ['sent', null],
    ['failed', null],
    ['skipped', 'aviso_cancelado'],
  ];
  for (const [status, reason] of finals) {
    const id = await newDelivery({ status, skip_reason: reason });
    await rejectsWith(setStatus(id, 'pending'), { code: RESTRICT_VIOLATION });
    assert.equal(await deliveryStatus(id), status, `${status} no debería cambiar`);
  }
});

test('RNF-005-01: pending pasa a sent, failed y skipped, y failed sigue en failed', async () => {
  const sent = await newDelivery();
  await run(
    "UPDATE notification_deliveries SET status = 'sent', sent_at = now(), attempts = 1 WHERE id = $1",
    [sent],
  );
  const failed = await newDelivery();
  await setStatus(failed, 'failed');
  await run(
    `UPDATE notification_deliveries SET status = 'failed', attempts = 4, last_error = 'timeout'
     WHERE id = $1`,
    [failed],
  );
  const skipped = await newDelivery();
  await setStatus(skipped, 'skipped', 'usuario_suspendido');

  assert.equal(await deliveryStatus(sent), 'sent');
  assert.equal(await deliveryStatus(failed), 'failed');
  assert.equal(await deliveryStatus(skipped), 'skipped');
});

test('RF-005-20: un reintento que sigue pending con más intentos y nueva fecha pasa', async () => {
  const id = await newDelivery();
  await run(
    `UPDATE notification_deliveries
     SET attempts = 1, next_attempt_at = now() + interval '5 minutes', last_error = 'timeout'
     WHERE id = $1`,
    [id],
  );
  assert.equal(await deliveryStatus(id), 'pending');
});

// ---------------------------------------------------------------- attempts

test('RF-005-20: attempts 5 y -1 fallan; 0 y 4 pasan', async () => {
  for (const attempts of [5, -1]) {
    const { id } = await newNotification();
    await rejectsWith(insertDelivery({ ...defaultDelivery(id), attempts }), {
      code: CHECK_VIOLATION,
      constraint: 'notification_deliveries_attempts_check',
    });
  }
  await newDelivery({ attempts: 0 });
  const id = await newDelivery({ attempts: 4 });
  await rejectsWith(run('UPDATE notification_deliveries SET attempts = 5 WHERE id = $1', [id]), {
    code: CHECK_VIOLATION,
    constraint: 'notification_deliveries_attempts_check',
  });
});

// ---------------------------------------------------------------- channel, status, last_error

test('RF-005-17: channel fuera de email y telegram falla', async () => {
  const { id } = await newNotification();
  for (const channel of ['sms', 'whatsapp', 'Email', '']) {
    await rejectsWith(insertDelivery({ ...defaultDelivery(id), channel }), {
      code: CHECK_VIOLATION,
      constraint: 'notification_deliveries_channel_check',
    });
  }
});

test('RF-005-20: status fuera de pending, sent, failed y skipped falla', async () => {
  const { id } = await newNotification();
  for (const status of ['enviado', 'cancelled', 'PENDING', '']) {
    await rejectsWith(insertDelivery({ ...defaultDelivery(id), status }), {
      code: CHECK_VIOLATION,
      constraint: 'notification_deliveries_status_check',
    });
  }
});

test('RF-005-20: last_error de 201 caracteres falla; de 200 pasa', async () => {
  const { id } = await newNotification();
  await rejectsWith(insertDelivery({ ...defaultDelivery(id), last_error: 'e'.repeat(201) }), {
    code: CHECK_VIOLATION,
    constraint: 'notification_deliveries_last_error_check',
  });
  await newDelivery({ notification_id: id, last_error: 'e'.repeat(200) });
});

test('RNF-005-03: notification_id, channel, respect_window y next_attempt_at son obligatorios', async () => {
  const { id } = await newNotification();
  for (const column of ['notification_id', 'channel', 'respect_window', 'next_attempt_at']) {
    await rejectsWith(insertDelivery({ ...defaultDelivery(id), [column]: null }), {
      code: NOT_NULL_VIOLATION,
      column,
    });
  }
});

test('RF-005-17: un envío de una notificación inexistente falla', async () => {
  await rejectsWith(insertDelivery(defaultDelivery('00000000-0000-4000-8000-000000000000')), {
    code: FK_VIOLATION,
    constraint: 'notification_deliveries_notification_id_fkey',
  });
});

test('RF-005-20: notification_deliveries_due_idx indexa los pendientes por next_attempt_at', async () => {
  const def = await indexdef('notification_deliveries_due_idx');
  assert.ok(
    def.endsWith(
      "ON public.notification_deliveries USING btree (next_attempt_at) WHERE (status = 'pending'::text)",
    ),
    def,
  );
});

// ---------------------------------------------------------------- retención (RF-005-21, F3)

test('RF-005-21: borrar una notificación con envíos falla (ON DELETE RESTRICT)', async () => {
  const { id } = await newNotification();
  await newDelivery({ notification_id: id });
  await rejectsWith(run('DELETE FROM notifications WHERE id = $1', [id]), {
    code: FK_VIOLATION,
    constraint: 'notification_deliveries_notification_id_fkey',
  });
});

test('RF-005-21: borrar primero los envíos y luego la notificación en una transacción pasa', async () => {
  // Es el orden que debe seguir el PurgeService del backend (T022).
  const { id } = await newNotification();
  await newDelivery({ notification_id: id, channel: 'email' });
  await newDelivery({ notification_id: id, channel: 'telegram' });

  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM notification_deliveries WHERE notification_id = $1', [id]);
    await client.query('DELETE FROM notifications WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const [row] = await run<{ n: number }>(
    `SELECT ((SELECT count(*) FROM notifications WHERE id = $1)
           + (SELECT count(*) FROM notification_deliveries WHERE notification_id = $1))::int AS n`,
    [id],
  );
  assert.equal(row?.n, 0);
});

// ---------------------------------------------------------------- notification_preferences

const PREFERENCE_SWITCHES = [
  'email_recordatorios',
  'email_resoluciones',
  'email_titular',
  'email_grupo',
  'telegram_recordatorios',
  'telegram_resoluciones',
  'telegram_titular',
  'telegram_grupo',
];

function insertPreferences(userId: string): Promise<unknown> {
  return run('INSERT INTO notification_preferences (user_id) VALUES ($1)', [userId]);
}

test('RF-005-17, RF-005-27: las preferencias nacen con los ocho interruptores en true', async () => {
  const userId = await newUserId();
  await insertPreferences(userId);
  const [row] = await run<Record<string, unknown>>(
    `SELECT ${PREFERENCE_SWITCHES.join(', ')}, telegram_blocked_at, email_bounced_at
     FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  assert.ok(row);
  for (const column of PREFERENCE_SWITCHES) assert.equal(row[column], true, column);
  assert.equal(row.telegram_blocked_at, null);
  assert.equal(row.email_bounced_at, null);
});

test('RF-005-17: una segunda fila de preferencias del mismo usuario falla', async () => {
  const userId = await newUserId();
  await insertPreferences(userId);
  await rejectsWith(insertPreferences(userId), {
    code: UNIQUE_VIOLATION,
    constraint: 'notification_preferences_pkey',
  });
});

test('RF-005-17: los interruptores no aceptan NULL', async () => {
  const userId = await newUserId();
  for (const column of PREFERENCE_SWITCHES) {
    await rejectsWith(
      run(`INSERT INTO notification_preferences (user_id, ${column}) VALUES ($1, NULL)`, [userId]),
      { code: NOT_NULL_VIOLATION, column },
    );
  }
});

test('RF-005-17: preferencias de un usuario inexistente fallan', async () => {
  await rejectsWith(insertPreferences('00000000-0000-4000-8000-000000000000'), {
    code: FK_VIOLATION,
    constraint: 'notification_preferences_user_id_fkey',
  });
});

test('RF-005-28: marcar telegram_blocked_at y apagar un interruptor pasa y mueve updated_at', async () => {
  const userId = await newUserId();
  await insertPreferences(userId);
  const [beforeRow] = await run<{ updated_at: Date }>(
    'SELECT updated_at FROM notification_preferences WHERE user_id = $1',
    [userId],
  );
  await run(
    `UPDATE notification_preferences SET telegram_blocked_at = now(), email_grupo = false
     WHERE user_id = $1`,
    [userId],
  );
  const [row] = await run<{
    telegram_blocked_at: Date | null;
    email_grupo: boolean;
    updated_at: Date;
  }>(
    `SELECT telegram_blocked_at, email_grupo, updated_at
     FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  assert.ok(row?.telegram_blocked_at);
  assert.equal(row.email_grupo, false);
  assert.ok(beforeRow && row.updated_at >= beforeRow.updated_at);
});

test('RF-005-17: borrar un usuario con preferencias falla (ON DELETE RESTRICT)', async () => {
  const userId = await newUserId();
  await insertPreferences(userId);
  await rejectsWith(run('DELETE FROM users WHERE id = $1', [userId]), {
    code: FK_VIOLATION,
    constraint: 'notification_preferences_user_id_fkey',
  });
});
