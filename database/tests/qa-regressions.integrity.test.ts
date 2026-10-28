// Regresiones de la revisión QA de la base de datos (BUG-002 a BUG-018, sin BUG-010, BUG-012,
// BUG-016 ni BUG-019). Cada caso intenta la violación que la base aceptaba y verifica que ahora
// se rechace; al lado, el camino correcto que usa el backend sigue pasando.
// Los datos base se crean una vez; cada prueba corre en una transacción que se deshace.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/migrate.ts';
import { createTempDatabase, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const quiet = (): void => undefined;

let db: TempDatabase;
const ids: Record<string, string> = {};

const FIXTURES = `
CREATE FUNCTION qa_user(p_tag text, p_role text, p_n int) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO users (full_name, email, email_fingerprint, password_hash, role, ci_encrypted,
                     ci_fingerprint, phone_e164, telegram_user_id, verified_at,
                     data_policy_accepted_at, data_policy_version)
  VALUES ('QA ' || p_tag, p_tag || '@qa.test', 'fp-' || p_tag, 'x', p_role, '\\x01'::bytea,
          'ci-' || p_tag,
          CASE WHEN p_role = 'admin' THEN NULL ELSE '+5917' || lpad(p_n::text, 7, '0') END,
          CASE WHEN p_role = 'admin' THEN NULL ELSE 800000000 + p_n END,
          now(), now(), 'v1')
  RETURNING id $$;
CREATE TABLE qa_ids (k text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO qa_ids VALUES
  ('owner', qa_user('owner', 'usuario', 1)), ('a', qa_user('a', 'usuario', 2)),
  ('b', qa_user('b', 'usuario', 3)), ('c', qa_user('c', 'usuario', 4)),
  ('admin1', qa_user('admin1', 'admin', 0)), ('admin2', qa_user('admin2', 'admin', 0));
CREATE FUNCTION qa(p_k text) RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT id FROM qa_ids WHERE k = p_k $$;
BEGIN;
INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                    total_slots, invite_code)
VALUES (qa('owner'), 'QA dos', 'Servicio QA', 4000, 'BS', 5, 4, 'QBBBBBB3'),
       (qa('owner'), 'QA tres', 'Servicio QA', 4000, 'BS', 5, 4, 'QCCCCCC4');
INSERT INTO qa_ids SELECT 'G2', id FROM groups WHERE invite_code = 'QBBBBBB3';
INSERT INTO qa_ids SELECT 'G3', id FROM groups WHERE invite_code = 'QCCCCCC4';
INSERT INTO group_members (group_id, user_id, role, join_source)
VALUES (qa('G2'), qa('owner'), 'titular', 'creacion'), (qa('G3'), qa('owner'), 'titular', 'creacion');
COMMIT;
INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
VALUES (qa('G2'), qa('b'), now(), now() + interval '1 day'),
       (qa('G3'), qa('c'), now(), now() + interval '1 day'),
       (qa('G2'), qa('a'), now(), now() + interval '1 day');
INSERT INTO qa_ids SELECT 'R_b', id FROM join_requests WHERE applicant_id = qa('b');
INSERT INTO qa_ids SELECT 'R_c', id FROM join_requests WHERE applicant_id = qa('c');
INSERT INTO qa_ids SELECT 'R_a', id FROM join_requests WHERE applicant_id = qa('a');
INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
VALUES (qa('G2'), qa('b'), 'miembro', 'solicitud', qa('R_b'));
INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date, issued_at,
                            price_cents, currency, total_bs_cents, member_count, base_share_cents,
                            owner_share_cents, remainder_cents, finalized_at)
VALUES (qa('G2'), '2026-10', qa('owner'), 'regular', '2026-10-05', '2026-10-08', now(),
        4000, 'BS', 4000, 2, 2000, 2000, 0, now());
INSERT INTO qa_ids SELECT 'CY2', id FROM billing_cycles WHERE group_id = qa('G2');
INSERT INTO charges (group_id, user_id, cycle_id, period, origin, amount_cents, price_cents,
                     currency, total_bs_cents, member_count, issued_at, due_at)
VALUES (qa('G2'), qa('b'), qa('CY2'), '2026-10', 'ciclo', 2000, 4000, 'BS', 4000, 2, now(),
        now() + interval '3 days');
INSERT INTO qa_ids SELECT 'CH_b', id FROM charges WHERE user_id = qa('b');
`;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query(FIXTURES);
    const { rows } = await client.query<{ k: string; id: string }>('SELECT k, id FROM qa_ids');
    for (const row of rows) ids[row.k] = row.id;
  } finally {
    await client.end();
  }
});

after(async () => {
  await db?.drop();
});

const id = (key: string): string => {
  const value = ids[key];
  if (!value) throw new Error(`falta el dato de prueba ${key}`);
  return value;
};

// Corre los pasos en una transacción que siempre se deshace. Las restricciones diferidas se
// vuelven inmediatas para que un error aparezca en el paso que lo provoca.
async function inRollback(work: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: db.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await work(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

async function fails(sql: string, params: unknown[], setup = ''): Promise<void> {
  await inRollback(async (client) => {
    if (setup) await client.query(setup);
    await assert.rejects(client.query(sql, params));
  });
}

async function passes(sql: string, params: unknown[], setup = ''): Promise<void> {
  await inRollback(async (client) => {
    if (setup) await client.query(setup);
    await client.query(sql, params);
  });
}

const ENTRY_CHARGE = `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, join_request_id,
  status, amount_cents, price_cents, currency, total_bs_cents, member_count, issued_at, due_at,
  paid_at, settled_by, settlement)
  VALUES ($1, $2, $3, '2026-10', 'ingreso', $4, 'pagado', 1333, 4000, 'BS', 4000, 3, now(),
  now() + interval '3 days', now(), $5, 'ingreso') RETURNING id`;

// ------------------------------------------------------------------------------- 010 (0056)

test('BUG-002, RN-010-03: una estadía por solicitud exige la solicitud de ese grupo y esa persona', async () => {
  const insert = `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
    VALUES ($1, $2, 'miembro', 'solicitud', $3)`;
  await fails(insert, [id('G2'), id('a'), id('R_c')]); // solicitud de c en G3
  await fails(insert, [id('G2'), id('c'), id('R_a')]); // solicitud de a, mismo grupo
  await passes(insert, [id('G2'), id('a'), id('R_a')]);
});

test('BUG-003, RN-010-03: el cobro de ingreso exige la solicitud de ese grupo y esa persona', async () => {
  await fails(ENTRY_CHARGE, [id('G2'), id('c'), id('CY2'), id('R_a'), id('owner')]);
  await passes(ENTRY_CHARGE, [id('G2'), id('a'), id('CY2'), id('R_a'), id('owner')]);
});

test('BUG-007, RN-010-05: el rechazo del titular exige motivo y quién decidió', async () => {
  const reject = `UPDATE join_requests SET status = 'rechazada', final_at = now(),
    final_reason = 'rechazo_titular', decided_by = $2, reject_reason = $3 WHERE id = $1`;
  await fails(reject, [id('R_c'), null, null]);
  await fails(reject, [id('R_c'), id('owner'), null]);
  await passes(reject, [id('R_c'), id('owner'), 'No hay cupo para este mes']);
  // El rechazo del sistema (p. ej. grupo cerrado) no lleva motivo del titular.
  await passes(
    `UPDATE join_requests SET status = 'rechazada', final_at = now(), final_reason = 'grupo_cerrado'
      WHERE id = $1`,
    [id('R_c')],
  );
});

test('BUG-018, RN-010-05: aceptada exige motivo y método coherentes y su propio cobro de ingreso', async () => {
  const toPayment = `UPDATE join_requests SET status = 'esperando_pago', payment_sent_at = now(),
    pay_deadline_at = now() + interval '15 minutes', quote_amount_cents = 1333 WHERE id = '${id('R_a')}';`;
  const accept = `UPDATE join_requests SET status = 'aceptada', final_at = now(), final_reason = $2,
    accepted_method = $3, decided_by = $4, charge_id = $5 WHERE id = $1`;
  // Motivo de vencimiento en una aceptada, y método que no coincide con el motivo.
  await inRollback(async (client) => {
    await client.query(toPayment);
    const { rows } = await client.query<{ id: string }>(ENTRY_CHARGE, [
      id('G2'),
      id('a'),
      id('CY2'),
      id('R_a'),
      id('owner'),
    ]);
    const chargeId = rows[0]?.id;
    await client.query('SAVEPOINT s');
    await assert.rejects(
      client.query(accept, [id('R_a'), 'plazo_pago', 'comprobante', id('owner'), chargeId]),
    );
    await client.query('ROLLBACK TO SAVEPOINT s');
    await assert.rejects(
      client.query(accept, [id('R_a'), 'confirmada', 'efectivo', id('owner'), chargeId]),
    );
    await client.query('ROLLBACK TO SAVEPOINT s');
    // El cobro de otra persona (CH_b, cobro de ciclo de b) no sirve.
    await assert.rejects(
      client.query(accept, [id('R_a'), 'confirmada', 'comprobante', id('owner'), id('CH_b')]),
    );
    await client.query('ROLLBACK TO SAVEPOINT s');
    await client.query(accept, [id('R_a'), 'confirmada', 'comprobante', id('owner'), chargeId]);
  });
});

// ------------------------------------------------------------------------------- 008 (0083)

test('BUG-004, RF-008-14: una solicitud por publicación exige una publicación del mismo grupo', async () => {
  const setup = `INSERT INTO listings (group_id, slots_offered, published_at, expires_at)
    VALUES ('${id('G3')}', 1, now(), now() + interval '30 days'),
           ('${id('G2')}', 1, now(), now() + interval '30 days');`;
  const open = `INSERT INTO join_requests (group_id, applicant_id, source, listing_id, opened_at,
    open_deadline_at) VALUES ($1, $2, 'publicacion', (SELECT id FROM listings WHERE group_id = $3),
    now(), now() + interval '1 day')`;
  await fails(open, [id('G2'), id('c'), id('G3')], setup);
  await passes(open, [id('G2'), id('c'), id('G2')], setup);
});

test('BUG-005, CA-008-02: subir slots_offered de una publicación activa por encima de los libres falla', async () => {
  // G2: 4 cupos, 2 activos (titular y b) -> 2 libres.
  const setup = `INSERT INTO listings (group_id, slots_offered, published_at, expires_at)
    VALUES ('${id('G2')}', 1, now(), now() + interval '30 days');`;
  const update = 'UPDATE listings SET slots_offered = $2 WHERE group_id = $1';
  await fails(update, [id('G2'), 3], setup);
  await fails(update, [id('G2'), 19], setup);
  await passes(update, [id('G2'), 2], setup);
});

test('BUG-005, RF-008-14: bajar slots_offered (ingreso por la publicación) sigue permitido', async () => {
  const setup = `INSERT INTO listings (group_id, slots_offered, published_at, expires_at)
    VALUES ('${id('G2')}', 2, now(), now() + interval '30 days');`;
  await passes('UPDATE listings SET slots_offered = 1 WHERE group_id = $1', [id('G2')], setup);
});

// ------------------------------------------------------------------------------- 002 (0045)

test('BUG-008, RF-002-17: un evento de cobro exige el grupo de su cobro', async () => {
  const insert = `INSERT INTO charge_events (charge_id, group_id, type, actor_kind)
    VALUES ($1, $2, 'generado', 'sistema')`;
  await fails(insert, [id('CH_b'), id('G3')]);
  await passes(insert, [id('CH_b'), id('G2')]);
});

test('BUG-015, RN-002-08: un cobro en revisión exige first_submitted_at', async () => {
  await fails(`UPDATE charges SET status = 'en_revision' WHERE id = $1`, [id('CH_b')]);
  await passes(
    `UPDATE charges SET status = 'en_revision', first_submitted_at = now() WHERE id = $1`,
    [id('CH_b')],
  );
});

// ------------------------------------------------------------------------------- 007 (0064)

test('BUG-013, RF-007-14: solo el dueño del cobro lo reporta', async () => {
  const insert = `INSERT INTO reputation_reports (charge_id, reporter_id, comment)
    VALUES ($1, $2, 'Este cobro no fue un atraso real')`;
  await fails(insert, [id('CH_b'), id('c')]);
  await passes(insert, [id('CH_b'), id('b')]);
});

test('BUG-013: un reporte decidido exige quién, cuándo y por qué', async () => {
  const insert = `INSERT INTO reputation_reports (charge_id, reporter_id, comment, status, decided_by,
    decided_at, decision_reason) VALUES ($1, $2, 'Este cobro no fue un atraso real', $3, $4, $5, $6)`;
  await fails(insert, [id('CH_b'), id('b'), 'excluido', null, null, null]);
  await fails(insert, [id('CH_b'), id('b'), 'rechazado', id('owner'), new Date(), null]);
  await passes(insert, [id('CH_b'), id('b'), 'excluido', id('owner'), new Date(), 'Pago a tiempo']);
});

test('BUG-014, RF-007-14: solo el titular del grupo excluye un cobro', async () => {
  const insert = `INSERT INTO charge_reputation_exclusions (charge_id, reason, excluded_by)
    VALUES ($1, 'El miembro pagó en efectivo a tiempo', $2)`;
  await fails(insert, [id('CH_b'), id('c')]);
  await passes(insert, [id('CH_b'), id('owner')]);
});

// ------------------------------------------------------------------------------- 009 (0096)

test('BUG-009, RN-009-02: no se promueve a admin a alguien con baneo o suspensión vigente', async () => {
  const promote = `UPDATE users SET role = 'admin' WHERE id = $1`;
  await fails(
    promote,
    [id('c')],
    `INSERT INTO bans (user_id, reason, source, banned_by)
     VALUES ('${id('c')}', 'Motivo de prueba QA', 'admin', '${id('admin1')}');`,
  );
  await fails(
    promote,
    [id('c')],
    `INSERT INTO user_suspensions (user_id, reason, suspended_by)
     VALUES ('${id('c')}', 'Motivo de prueba QA', '${id('admin1')}');`,
  );
  await passes(promote, [id('c')]);
});

test('BUG-011: una suspensión reactivada no se reabre ni cambia', async () => {
  const setup = `INSERT INTO user_suspensions (user_id, reason, suspended_by, reactivated_at, reactivated_by)
    VALUES ('${id('a')}', 'Motivo de prueba QA', '${id('admin1')}', now(), '${id('admin1')}');`;
  await fails(
    'UPDATE user_suspensions SET reactivated_at = NULL, reactivated_by = NULL WHERE user_id = $1',
    [id('a')],
    setup,
  );
  await fails(
    `UPDATE user_suspensions SET reason = 'Otro motivo cambiado' WHERE user_id = $1`,
    [id('a')],
    setup,
  );
});

test('BUG-011: una suspensión abierta solo cambia al reactivarse', async () => {
  const setup = `INSERT INTO user_suspensions (user_id, reason, suspended_by)
    VALUES ('${id('a')}', 'Motivo de prueba QA', '${id('admin1')}');`;
  await fails(
    `UPDATE user_suspensions SET reason = 'Otro motivo cambiado' WHERE user_id = $1`,
    [id('a')],
    setup,
  );
  await passes(
    'UPDATE user_suspensions SET reactivated_at = now(), reactivated_by = $2 WHERE user_id = $1',
    [id('a'), id('admin2')],
    setup,
  );
});

test('BUG-011: una habilitación revocada no vuelve; una vigente solo cambia al revocarse', async () => {
  const revoked = `INSERT INTO host_enablements (user_id, reason, enabled_by, revoked_at, revoked_by, revoke_reason)
    VALUES ('${id('a')}', 'Motivo de prueba QA', '${id('admin1')}', now(), '${id('admin1')}', 'Revocada en prueba QA');`;
  await fails(
    'UPDATE host_enablements SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE user_id = $1',
    [id('a')],
    revoked,
  );
  const active = `INSERT INTO host_enablements (user_id, reason, enabled_by)
    VALUES ('${id('a')}', 'Motivo de prueba QA', '${id('admin1')}');`;
  await fails(
    `UPDATE host_enablements SET reason = 'Otro motivo cambiado' WHERE user_id = $1`,
    [id('a')],
    active,
  );
  await passes(
    `UPDATE host_enablements SET revoked_at = now(), revoked_by = $2, revoke_reason = 'Revocada en prueba QA'
      WHERE user_id = $1`,
    [id('a'), id('admin2')],
    active,
  );
});

test('BUG-017: revertir, revocar o reactivar antes de la fecha de inicio falla', async () => {
  await fails(
    `INSERT INTO bans (user_id, reason, source, banned_by, banned_at, revoked_at, revoked_by, revoke_reason)
     VALUES ($1, 'Motivo de prueba QA', 'admin', $2, now(), now() - interval '10 days', $3,
             'Revocado antes de banear')`,
    [id('a'), id('admin1'), id('admin2')],
  );
  await fails(
    `INSERT INTO host_enablements (user_id, reason, enabled_by, enabled_at, revoked_at, revoked_by, revoke_reason)
     VALUES ($1, 'Motivo de prueba QA', $2, now(), now() - interval '1 day', $2, 'Revocada antes de habilitar')`,
    [id('a'), id('admin1')],
  );
  await fails(
    `INSERT INTO user_suspensions (user_id, reason, suspended_by, suspended_at, reactivated_at, reactivated_by)
     VALUES ($1, 'Motivo de prueba QA', $2, now(), now() - interval '1 day', $2)`,
    [id('a'), id('admin1')],
  );
  await passes(
    `INSERT INTO bans (user_id, reason, source, banned_by, banned_at, revoked_at, revoked_by, revoke_reason)
     VALUES ($1, 'Motivo de prueba QA', 'admin', $2, now() - interval '3 days', now(), $3,
             'Revocado después de banear')`,
    [id('a'), id('admin1'), id('admin2')],
  );
});
