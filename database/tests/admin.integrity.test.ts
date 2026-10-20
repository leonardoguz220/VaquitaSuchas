// Spec 009 (data-model.md §1 y §3): integridad de bans (0090), host_enablements (0091),
// admin_audit_log (0092), user_suspensions (0093) y los disparadores de 0094. Cada restricción se
// prueba intentando violarla. Todos los datos son ficticios.
//
// Pruebas primero (T001): hasta que existan 0090-0094 este archivo falla por relaciones
// inexistentes.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';
const RESTRICT_VIOLATION = '23001';

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const POLICY_VERSION = '2026-10-18';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const REASON = 'Fraude comprobado con comprobantes falsos';

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

function newUserId(overrides: Row = {}): Promise<string> {
  sequence += 1;
  const n = sequence;
  const email = `admin${n}@example.com`;
  return insertRow('users', {
    full_name: `Persona de Prueba ${n}`,
    email,
    email_fingerprint: fingerprint(`email:${email}`),
    password_hash: FAKE_HASH,
    ci_encrypted: Buffer.from([0x01, 0x02, 0x03, n % 256]),
    ci_fingerprint: fingerprint(`ci:${7000000 + n}`),
    phone_e164: `+5917${String(n + 900).padStart(7, '0')}`,
    telegram_user_id: String(300000000 + n),
    data_policy_accepted_at: new Date(),
    data_policy_version: POLICY_VERSION,
    ...overrides,
  });
}

function newAdminId(): Promise<string> {
  return newUserId({ role: 'admin', phone_e164: null, telegram_user_id: null });
}

// ================================================================ bans (0090)

function banValues(userId: string, bannedBy: string, overrides: Row = {}): Row {
  return { user_id: userId, reason: REASON, source: 'admin', banned_by: bannedBy, ...overrides };
}

describe('bans (0090)', () => {
  test('RF-009-23: un baneo válido nace vigente con banned_at por defecto', async () => {
    const id = await insertRow('bans', banValues(await newUserId(), await newAdminId()));
    const [row] = await run<{ banned_at: Date | null; revoked_at: Date | null }>(
      'SELECT banned_at, revoked_at FROM bans WHERE id = $1',
      [id],
    );
    assert.ok(row?.banned_at instanceof Date);
    assert.equal(row?.revoked_at, null);
  });

  test('RF-009-23: un segundo baneo vigente falla; tras revertir se permite otro', async () => {
    const userId = await newUserId();
    const first = await newAdminId();
    const second = await newAdminId();
    const id = await insertRow('bans', banValues(userId, first));
    await rejectsWith(insertRow('bans', banValues(userId, first)), {
      code: UNIQUE_VIOLATION,
      constraint: 'bans_active_user_uq',
    });
    await updateRow('bans', id, {
      revoked_at: new Date(),
      revoked_by: second,
      revoke_reason: 'Se comprobó que no hubo fraude',
    });
    await insertRow('bans', banValues(userId, first));
  });

  test('CA-009-23, RN-009-07: un motivo de 9 o 301 caracteres falla; 10 y 300 pasan', async () => {
    const adminId = await newAdminId();
    for (const reason of ['a'.repeat(9), 'a'.repeat(301), `   ${'a'.repeat(9)}   `]) {
      await rejectsWith(insertRow('bans', banValues(await newUserId(), adminId, { reason })), {
        code: CHECK_VIOLATION,
        constraint: 'bans_reason_check',
      });
    }
    for (const reason of ['a'.repeat(10), 'a'.repeat(300)]) {
      await insertRow('bans', banValues(await newUserId(), adminId, { reason }));
    }
  });

  test('CA-009-34: revertir con el mismo administrador que baneó falla', async () => {
    const adminId = await newAdminId();
    const id = await insertRow('bans', banValues(await newUserId(), adminId));
    await rejectsWith(
      updateRow('bans', id, {
        revoked_at: new Date(),
        revoked_by: adminId,
        revoke_reason: 'Se comprobó que no hubo fraude',
      }),
      { code: CHECK_VIOLATION, constraint: 'bans_revoked_by_check' },
    );
  });

  test('RF-009-23: una reversión incompleta o con motivo corto falla', async () => {
    const id = await insertRow('bans', banValues(await newUserId(), await newAdminId()));
    const other = await newAdminId();
    await rejectsWith(updateRow('bans', id, { revoked_at: new Date(), revoked_by: other }), {
      code: CHECK_VIOLATION,
      constraint: 'bans_revoked_check',
    });
    await rejectsWith(
      updateRow('bans', id, { revoked_at: new Date(), revoked_by: other, revoke_reason: 'corto' }),
      { code: CHECK_VIOLATION, constraint: 'bans_revoke_reason_check' },
    );
  });

  test('RN-009-07: nadie se banea a sí mismo', async () => {
    // El disparador admin_not_banned_or_suspended también rechaza banear a un administrador; el
    // CHECK se comprueba con un usuario común que figura como quien banea.
    const userId = await newUserId();
    await rejectsWith(insertRow('bans', banValues(userId, userId)), {
      code: CHECK_VIOLATION,
      constraint: 'bans_banned_by_check',
    });
  });

  test('RF-009-19: source fuera de admin y reclamo falla; source y dispute_id van juntos', async () => {
    const adminId = await newAdminId();
    await rejectsWith(
      insertRow('bans', banValues(await newUserId(), adminId, { source: 'otro' })),
      {
        code: CHECK_VIOLATION,
        constraint: 'bans_source_check',
      },
    );
    await rejectsWith(
      insertRow('bans', banValues(await newUserId(), adminId, { source: 'reclamo' })),
      { code: CHECK_VIOLATION, constraint: 'bans_dispute_id_check' },
    );
    await rejectsWith(
      insertRow('bans', banValues(await newUserId(), adminId, { dispute_id: MISSING_ID })),
      { code: CHECK_VIOLATION, constraint: 'bans_dispute_id_check' },
    );
    await rejectsWith(
      insertRow(
        'bans',
        banValues(await newUserId(), adminId, { source: 'reclamo', dispute_id: MISSING_ID }),
      ),
      { code: FK_VIOLATION, constraint: 'bans_dispute_id_fkey' },
    );
  });

  test('CA-009-13: banear a un administrador falla', async () => {
    await rejectsWith(insertRow('bans', banValues(await newAdminId(), await newAdminId())), {
      code: CHECK_VIOLATION,
    });
  });

  test('integridad: los datos del baneo no cambian y la reversión se fija una sola vez', async () => {
    const id = await insertRow('bans', banValues(await newUserId(), await newAdminId()));
    await rejectsWith(updateRow('bans', id, { reason: 'Otro motivo distinto del original' }), {
      code: RESTRICT_VIOLATION,
    });
    await updateRow('bans', id, {
      revoked_at: new Date(),
      revoked_by: await newAdminId(),
      revoke_reason: 'Se comprobó que no hubo fraude',
    });
    await rejectsWith(updateRow('bans', id, { revoke_reason: 'Otro motivo de reversión' }), {
      code: RESTRICT_VIOLATION,
    });
  });

  test('RF-003-19: banned_identities.ban_ref apunta a un baneo existente', async () => {
    const banId = await insertRow('bans', banValues(await newUserId(), await newAdminId()));
    await rejectsWith(
      insertRow('banned_identities', {
        kind: 'email',
        fingerprint: fingerprint('email:missing'),
        ban_ref: MISSING_ID,
      }),
      { code: FK_VIOLATION, constraint: 'banned_identities_ban_ref_fkey' },
    );
    await insertRow('banned_identities', {
      kind: 'email',
      fingerprint: fingerprint('email:banned'),
      ban_ref: banId,
    });
  });

  test('RF-009-23: bans_user_idx indexa (user_id, banned_at DESC)', async () => {
    const [index] = await run<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'bans_user_idx'",
    );
    assert.ok(index?.indexdef.endsWith('USING btree (user_id, banned_at DESC)'), index?.indexdef);
  });
});

// ================================================================ host_enablements (0091)

describe('host_enablements (0091)', () => {
  function enablement(userId: string, adminId: string, overrides: Row = {}): Row {
    return {
      user_id: userId,
      reason: 'Titular conocido del equipo',
      enabled_by: adminId,
      ...overrides,
    };
  }

  test('RF-009-21: dos habilitaciones vigentes del mismo usuario fallan; tras revocar se permite otra', async () => {
    const userId = await newUserId();
    const adminId = await newAdminId();
    const id = await insertRow('host_enablements', enablement(userId, adminId));
    await rejectsWith(insertRow('host_enablements', enablement(userId, adminId)), {
      code: UNIQUE_VIOLATION,
      constraint: 'host_enablements_active_uq',
    });
    await updateRow('host_enablements', id, {
      revoked_at: new Date(),
      revoked_by: adminId,
      revoke_reason: 'Ya no administra el grupo',
    });
    await insertRow('host_enablements', enablement(userId, adminId));
  });

  test('RF-009-21: un motivo de 9 o 301 caracteres falla', async () => {
    const adminId = await newAdminId();
    for (const reason of ['a'.repeat(9), 'a'.repeat(301)]) {
      await rejectsWith(
        insertRow('host_enablements', enablement(await newUserId(), adminId, { reason })),
        { code: CHECK_VIOLATION, constraint: 'host_enablements_reason_check' },
      );
    }
  });

  test('RF-009-21: una revocación incompleta falla', async () => {
    const adminId = await newAdminId();
    const id = await insertRow('host_enablements', enablement(await newUserId(), adminId));
    await rejectsWith(updateRow('host_enablements', id, { revoked_at: new Date() }), {
      code: CHECK_VIOLATION,
      constraint: 'host_enablements_revoked_check',
    });
  });

  test('RF-009-21: usuario y administrador deben existir', async () => {
    const adminId = await newAdminId();
    await rejectsWith(insertRow('host_enablements', enablement(MISSING_ID, adminId)), {
      code: FK_VIOLATION,
      constraint: 'host_enablements_user_id_fkey',
    });
    await rejectsWith(insertRow('host_enablements', enablement(await newUserId(), MISSING_ID)), {
      code: FK_VIOLATION,
      constraint: 'host_enablements_enabled_by_fkey',
    });
  });
});

// ================================================================ admin_audit_log (0092)

const ACTIONS = [
  'catalogo_crear',
  'catalogo_editar',
  'catalogo_activar',
  'catalogo_desactivar',
  'catalogo_importar',
  'usuario_suspender',
  'usuario_reactivar',
  'usuario_banear',
  'baneo_revertir',
  'rol_promover',
  'rol_quitar',
  'titular_habilitar',
  'titular_quitar_habilitacion',
  'reclamo_abrir_evidencia',
  'reclamo_resolver',
  'publicacion_restaurar',
  'publicacion_eliminar',
  'publicacion_eliminar_y_suspender',
  'titularidad_transferir',
];

describe('admin_audit_log (0092)', () => {
  function entry(adminId: string, overrides: Row = {}): Row {
    return { admin_id: adminId, action: 'usuario_banear', target_type: 'user', ...overrides };
  }

  test('RF-009-18: las acciones del modelo se aceptan con metadata {} por defecto', async () => {
    const adminId = await newAdminId();
    for (const action of ACTIONS) await insertRow('admin_audit_log', entry(adminId, { action }));
    const [row] = await run<{ metadata: unknown; same: boolean }>(
      `SELECT metadata, occurred_at IS NOT NULL AS same FROM admin_audit_log
       WHERE admin_id = $1 LIMIT 1`,
      [adminId],
    );
    assert.deepEqual(row, { metadata: {}, same: true });
  });

  test('CA-009-19: una action fuera de la lista falla', async () => {
    await rejectsWith(
      insertRow('admin_audit_log', entry(await newAdminId(), { action: 'usuario_borrar' })),
      { code: CHECK_VIOLATION, constraint: 'admin_audit_log_action_check' },
    );
  });

  test('RF-009-18: un target_type fuera de la lista falla', async () => {
    await rejectsWith(
      insertRow('admin_audit_log', entry(await newAdminId(), { target_type: 'charge' })),
      { code: CHECK_VIOLATION, constraint: 'admin_audit_log_target_type_check' },
    );
  });

  test('RF-009-18: un motivo de 9 o 301 caracteres falla; sin motivo pasa', async () => {
    const adminId = await newAdminId();
    for (const reason of ['a'.repeat(9), 'a'.repeat(301)]) {
      await rejectsWith(insertRow('admin_audit_log', entry(adminId, { reason })), {
        code: CHECK_VIOLATION,
        constraint: 'admin_audit_log_reason_check',
      });
    }
    await insertRow('admin_audit_log', entry(adminId, { reason: null }));
  });

  test('CA-009-19, RNF-009-03: UPDATE y DELETE en admin_audit_log fallan', async () => {
    const id = await insertRow('admin_audit_log', entry(await newAdminId()));
    await rejectsWith(updateRow('admin_audit_log', id, { reason: 'Motivo cambiado después' }), {
      code: RESTRICT_VIOLATION,
    });
    await rejectsWith(run('DELETE FROM admin_audit_log WHERE id = $1', [id]), {
      code: RESTRICT_VIOLATION,
    });
  });

  test('RF-009-18: admin_id, action y target_type son obligatorios; el administrador debe existir', async () => {
    const adminId = await newAdminId();
    for (const column of ['admin_id', 'action', 'target_type']) {
      await rejectsWith(insertRow('admin_audit_log', entry(adminId, { [column]: null })), {
        code: NOT_NULL_VIOLATION,
        column,
      });
    }
    await rejectsWith(insertRow('admin_audit_log', entry(MISSING_ID)), {
      code: FK_VIOLATION,
      constraint: 'admin_audit_log_admin_id_fkey',
    });
  });

  test('RNF-009-03: los índices por administrador, objetivo y acción existen', async () => {
    const rows = await run<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'admin_audit_log'
       ORDER BY indexname`,
    );
    const defs = Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
    assert.ok(defs.admin_audit_log_admin_idx?.endsWith('(admin_id, occurred_at DESC)'));
    assert.ok(
      defs.admin_audit_log_target_idx?.endsWith('(target_type, target_id, occurred_at DESC)'),
    );
    assert.ok(defs.admin_audit_log_action_idx?.endsWith('(action, occurred_at DESC)'));
  });
});

// ================================================================ user_suspensions (0093)

describe('user_suspensions (0093)', () => {
  function suspension(userId: string, adminId: string, overrides: Row = {}): Row {
    return {
      user_id: userId,
      reason: 'Publicó datos de pago falsos',
      suspended_by: adminId,
      ...overrides,
    };
  }

  test('RF-009-10: una suspensión abierta por usuario; reactivar permite otra', async () => {
    const userId = await newUserId();
    const adminId = await newAdminId();
    const id = await insertRow('user_suspensions', suspension(userId, adminId));
    await rejectsWith(insertRow('user_suspensions', suspension(userId, adminId)), {
      code: UNIQUE_VIOLATION,
      constraint: 'user_suspensions_open_uq',
    });
    await updateRow('user_suspensions', id, {
      reactivated_at: new Date(),
      reactivated_by: adminId,
    });
    await insertRow('user_suspensions', suspension(userId, adminId));
  });

  test('RN-009-04: un motivo de 9 o 301 caracteres falla', async () => {
    const adminId = await newAdminId();
    for (const reason of ['a'.repeat(9), 'a'.repeat(301)]) {
      await rejectsWith(
        insertRow('user_suspensions', suspension(await newUserId(), adminId, { reason })),
        { code: CHECK_VIOLATION, constraint: 'user_suspensions_reason_check' },
      );
    }
  });

  test('RF-009-10: reactivated_at sin reactivated_by falla', async () => {
    const id = await insertRow(
      'user_suspensions',
      suspension(await newUserId(), await newAdminId()),
    );
    await rejectsWith(updateRow('user_suspensions', id, { reactivated_at: new Date() }), {
      code: CHECK_VIOLATION,
      constraint: 'user_suspensions_reactivated_check',
    });
  });

  test('RF-009-10: nadie se suspende a sí mismo', async () => {
    const userId = await newUserId();
    await rejectsWith(insertRow('user_suspensions', suspension(userId, userId)), {
      code: CHECK_VIOLATION,
      constraint: 'user_suspensions_suspended_by_check',
    });
  });

  test('CA-009-29: suspender a un administrador falla', async () => {
    await rejectsWith(
      insertRow('user_suspensions', suspension(await newAdminId(), await newAdminId())),
      { code: CHECK_VIOLATION },
    );
  });
});

// ================================================================ last_admin_guard (0094)

describe('last_admin_guard (0094)', () => {
  test('CA-009-12, RN-009-01: dejar al sistema sin administrador activo falla', async () => {
    const last = await newAdminId();
    // Quedan como administradores solo `last`: los demás pasan a usuario en una sentencia.
    const others = await run<{ id: string }>(
      `UPDATE users SET role = 'usuario' WHERE role = 'admin' AND id <> $1 RETURNING id`,
      [last],
    );
    try {
      await rejectsWith(updateRow('users', last, { role: 'usuario' }), { code: CHECK_VIOLATION });
      for (const status of ['suspendido', 'baneado']) {
        await rejectsWith(updateRow('users', last, { status }), { code: CHECK_VIOLATION });
      }
      const [row] = await run<{ role: string; status: string }>(
        'SELECT role, status FROM users WHERE id = $1',
        [last],
      );
      assert.deepEqual(row, { role: 'admin', status: 'activo' });

      // Con otro administrador activo, el cambio pasa.
      await newAdminId();
      await updateRow('users', last, { role: 'usuario' });
    } finally {
      await run(`UPDATE users SET role = 'admin' WHERE id = ANY($1::uuid[])`, [
        others.map((row) => row.id),
      ]);
    }
  });

  test('RN-009-01: cambiar a un usuario común no depende de los administradores', async () => {
    const userId = await newUserId();
    await updateRow('users', userId, { status: 'suspendido' });
  });
});
