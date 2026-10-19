// Seeds de desarrollo (spec 001 T005 y siguientes): corren sobre los usuarios que crea
// `npm run seed:dev-users -w backend` (spec 003 T046), referenciados por correo. Aquí se crean
// usuarios ficticios con esos correos y se corre la carpeta real de seeds dos veces: la segunda
// no cambia nada. Sin esos usuarios (base recién creada o producción) los seeds no hacen nada.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';
import { createTempDatabase, queryRows, type TempDatabase } from './helpers/temp-db.ts';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../seeds/', import.meta.url));
const quiet = (): void => undefined;

const FAKE_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$ZmFrZQ';
const DEV_EMAILS = [
  'titular@dev.vaquita',
  'miembro1@dev.vaquita',
  'miembro2@dev.vaquita',
  'miembro3@dev.vaquita',
];

let db: TempDatabase;

before(async () => {
  db = await createTempDatabase();
  await migrate({ connectionString: db.connectionString, migrationsDir, log: quiet });
});

after(async () => {
  await db?.drop();
});

type Row = Record<string, unknown>;

function run<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return queryRows<T>(db.connectionString, sql, params);
}

function fingerprint(value: string): string {
  return createHmac('sha256', 'test-only-key').update(value).digest('hex');
}

function runSeeds(): Promise<unknown> {
  return seed({ connectionString: db.connectionString, seedsDir, log: quiet });
}

// Cuenta de filas de las tablas que tocan los seeds de desarrollo.
async function counts(): Promise<Row> {
  const [row] = await run(
    `SELECT (SELECT count(*)::int FROM groups) AS groups,
            (SELECT count(*)::int FROM group_members) AS members,
            (SELECT count(*)::int FROM join_requests) AS requests,
            (SELECT count(*)::int FROM billing_cycles) AS cycles,
            (SELECT count(*)::int FROM charges) AS charges`,
  );
  assert.ok(row);
  return row;
}

test('RF-001-01: sin los usuarios de desarrollo los seeds no siembran grupos', async () => {
  await runSeeds();
  assert.deepEqual(await counts(), { groups: 0, members: 0, requests: 0, cycles: 0, charges: 0 });
});

test('RF-001-01: con los usuarios de desarrollo se siembran dos grupos y la segunda corrida no cambia nada', async () => {
  for (const [i, email] of DEV_EMAILS.entries()) {
    await run(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, phone_e164, telegram_user_id, verified_at,
                          data_policy_accepted_at, data_policy_version)
       VALUES ($1, $2, $3, $4, '\\x01'::bytea, $5, $6, $7, now(), now(), '2026-10-18')`,
      [
        `Persona Dev ${i}`,
        email,
        fingerprint(`email:${email}`),
        FAKE_HASH,
        fingerprint(`ci:${i}`),
        `+5917000000${i}`,
        String(100000000 + i),
      ],
    );
  }
  await runSeeds();
  const first = await counts();
  await runSeeds();
  assert.deepEqual(await counts(), first);

  const groups = await run<{ name: string; owner: string; members: number }>(
    `SELECT g.name, u.email AS owner,
            (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id) AS members
     FROM groups g JOIN users u ON u.id = g.owner_id
     WHERE g.invite_code IN ('DEVGRPAA', 'DEVGRPBB')
     ORDER BY g.invite_code`,
  );
  assert.equal(groups.length, 2);
  for (const group of groups) assert.equal(group.owner, 'titular@dev.vaquita');
  assert.equal(groups[0]?.members, 4);
});

test('RF-001-01: cada miembro entra por una solicitud aceptada con su cobro de ingreso pagado', async () => {
  const rows = await run<{ problems: number }>(
    `SELECT count(*)::int AS problems
     FROM group_members m
     LEFT JOIN join_requests r ON r.id = m.join_request_id
     LEFT JOIN charges c ON c.id = r.charge_id
     WHERE m.role = 'miembro'
       AND (r.status IS DISTINCT FROM 'aceptada' OR c.origin IS DISTINCT FROM 'ingreso'
            OR c.status IS DISTINCT FROM 'pagado' OR c.user_id <> m.user_id)`,
  );
  assert.equal(rows[0]?.problems, 0);
  const [titular] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM group_members m JOIN groups g ON g.id = m.group_id
     WHERE m.role = 'titular' AND m.join_source = 'creacion'
       AND g.invite_code IN ('DEVGRPAA', 'DEVGRPBB')`,
  );
  assert.equal(titular?.n, 2);
});

// Nadie sale durante el ciclo inicial: cuenta todas las estadías (el seed de 0040 retira a
// miembro3 por mora en el ciclo regular siguiente).
test('RN-001-10: el ciclo inicial de cada grupo cuenta a sus miembros y suma el total', async () => {
  const rows = await run<{ ok: boolean }>(
    `SELECT bc.member_count = (SELECT count(*) FROM group_members m
                               WHERE m.group_id = bc.group_id)
            AND bc.total_bs_cents = g.total_bs_cents AS ok
     FROM billing_cycles bc JOIN groups g ON g.id = bc.group_id
     WHERE bc.cycle_type = 'inicial' AND g.invite_code IN ('DEVGRPAA', 'DEVGRPBB')`,
  );
  assert.equal(rows.length, 2);
  for (const row of rows) assert.equal(row.ok, true);
});

test('RF-002-01: el ciclo regular de DEVGRPAA tiene un cobro pendiente, uno en revisión con comprobante y uno atrasado con el miembro retirado por mora', async () => {
  const rows = await run<{ email: string; status: string; receipts: number; left_reason: string }>(
    `SELECT u.email, c.status,
            (SELECT count(*)::int FROM receipts r
              WHERE r.charge_id = c.id AND r.status = 'vigente') AS receipts,
            (SELECT m.left_reason FROM group_members m
              WHERE m.group_id = c.group_id AND m.user_id = c.user_id
              ORDER BY m.joined_at DESC LIMIT 1) AS left_reason
     FROM charges c
     JOIN billing_cycles bc ON bc.id = c.cycle_id
     JOIN groups g ON g.id = c.group_id
     JOIN users u ON u.id = c.user_id
     WHERE g.invite_code = 'DEVGRPAA' AND bc.cycle_type = 'regular'
     ORDER BY u.email`,
  );
  assert.deepEqual(rows, [
    { email: 'miembro1@dev.vaquita', status: 'pendiente', receipts: 0, left_reason: null },
    { email: 'miembro2@dev.vaquita', status: 'en_revision', receipts: 1, left_reason: null },
    { email: 'miembro3@dev.vaquita', status: 'atrasado', receipts: 0, left_reason: 'mora' },
  ]);
  const [initial] = await run<{ finalized: boolean }>(
    `SELECT bc.finalized_at IS NOT NULL AS finalized
     FROM billing_cycles bc JOIN groups g ON g.id = bc.group_id
     WHERE g.invite_code = 'DEVGRPAA' AND bc.cycle_type = 'inicial'`,
  );
  assert.equal(initial?.finalized, true);
});

test('RF-010-02: hay una solicitud en cada estado activo con chat y una rechazada con un reclamo abierto', async () => {
  const rows = await run<{
    code: string;
    email: string;
    status: string;
    messages: number;
    disputes: number;
  }>(
    `SELECT g.invite_code AS code, u.email, r.status,
            (SELECT count(*)::int FROM join_messages m WHERE m.request_id = r.id) AS messages,
            (SELECT count(*)::int FROM join_disputes d
              WHERE d.request_id = r.id AND d.status = 'abierto') AS disputes
     FROM join_requests r
     JOIN groups g ON g.id = r.group_id
     JOIN users u ON u.id = r.applicant_id
     WHERE r.status <> 'aceptada'
     ORDER BY g.invite_code, u.email`,
  );
  assert.deepEqual(rows, [
    {
      code: 'DEVGRPBB',
      email: 'miembro2@dev.vaquita',
      status: 'abierta',
      messages: 2,
      disputes: 0,
    },
    {
      code: 'DEVGRPBB',
      email: 'miembro3@dev.vaquita',
      status: 'esperando_pago',
      messages: 2,
      disputes: 0,
    },
    {
      code: 'DEVGRPCC',
      email: 'miembro2@dev.vaquita',
      status: 'pago_informado',
      messages: 2,
      disputes: 0,
    },
    {
      code: 'DEVGRPCC',
      email: 'miembro3@dev.vaquita',
      status: 'rechazada',
      messages: 2,
      disputes: 1,
    },
  ]);
});
