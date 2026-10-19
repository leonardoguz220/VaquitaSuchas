import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import { BillingModule } from '../src/modules/billing/billing.module.js';
import { BillingCyclesService } from '../src/modules/billing/services/billing-cycles.service.js';
import { OverdueService } from '../src/modules/billing/services/overdue.service.js';
import { Clock } from '../src/shared/clock/clock.js';
import { ClockModule } from '../src/shared/clock/clock.module.js';
import { FakeClock } from '../src/shared/clock/fake-clock.js';
import { DbModule } from '../src/shared/db/db.module.js';
import { DbService } from '../src/shared/db/db.service.js';
import type { ChargeGenerated } from '../src/shared/events/charge-events.js';
import { EventsModule } from '../src/shared/events/events.module.js';
import type {
  GroupCreated,
  MemberAdded,
  MemberRemoved,
} from '../src/shared/events/group-events.js';
import { TxEventBus } from '../src/shared/events/tx-event-bus.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { JobsModule } from '../src/shared/jobs/jobs.module.js';
import {
  MemoryFileStorage,
  fakeMailModule,
  memoryStorageModule,
} from './support/billing-harness.js';

// Generación automática de cobros (spec 002, US6, T012) contra PostgreSQL REAL con FakeClock. Usa
// una base temporal propia, creada y borrada aquí. Credenciales por defecto: las de desarrollo
// local de docker-compose.yml (no son secretos).
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function urlForDatabase(name: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: ADMIN_DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

interface CycleRow {
  period: string;
  cycle_type: string;
  cut_date: string;
  member_count: number;
  base_share_cents: string;
  owner_share_cents: string;
  remainder_cents: string;
  total_bs_cents: string;
  issued_at: Date;
  finalized_at: Date | null;
}

interface ChargeRow {
  user_id: string;
  period: string;
  status: string;
  origin: string;
  amount_cents: string;
  issued_at: Date;
  due_at: Date;
}

describe('Generación automática de cobros contra PostgreSQL real', () => {
  const databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  const databaseUrl = urlForDatabase(databaseName);
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JOBS_INPROCESS: process.env.JOBS_INPROCESS,
    JWT_SECRET: process.env.JWT_SECRET,
    FINGERPRINT_KEY: process.env.FINGERPRINT_KEY,
    CI_ENCRYPTION_KEY: process.env.CI_ENCRYPTION_KEY,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  let inspect: Pool;
  let moduleRef: TestingModule;
  let clock: FakeClock;
  let runner: JobRunner;
  let db: DbService;
  let bus: TxEventBus;
  let service: BillingCyclesService;
  let userSeq = 0;
  let groupSeq = 0;

  beforeAll(async () => {
    try {
      await withAdminClient((client) => client.query(`CREATE DATABASE "${databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible: levanta la base con npm run db:up (o define TEST_DATABASE_URL).',
      );
    }
    inspect = new Pool({ connectionString: databaseUrl, max: 3 });
    inspect.on('error', () => undefined);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      await inspect.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
    process.env.DATABASE_URL = databaseUrl;
    process.env.JOBS_INPROCESS = 'false';
    // BillingModule monta controladores con AuthGuard (lee JWT_SECRET) y usa FileStorage.
    process.env.JWT_SECRET = 'secreto-e2e-de-al-menos-treinta-y-dos-caracteres';
    // AuthModule (spec 003) arrastra identidad y el webhook de Telegram.
    process.env.FINGERPRINT_KEY = 'fingerprint-test-key';
    process.env.CI_ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret-de-prueba';
  }, 60_000);

  afterAll(async () => {
    for (const key of Object.keys(originalEnv) as (keyof typeof originalEnv)[]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    await inspect?.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
    );
  }, 30_000);

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await inspect.query('DELETE FROM job_runs');
    // Los grupos de pruebas anteriores no deben contar en los totales de la tarea.
    await inspect.query(
      "UPDATE groups SET status = 'cerrado', closed_at = now() WHERE status = 'activo'",
    );
    clock = new FakeClock('2026-10-15T04:00:00.000Z');
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        ClockModule,
        DbModule,
        EventsModule,
        JobsModule,
        memoryStorageModule(new MemoryFileStorage()),
        fakeMailModule(),
        BillingModule,
      ],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    await moduleRef.init();
    runner = moduleRef.get(JobRunner);
    db = moduleRef.get(DbService);
    bus = moduleRef.get(TxEventBus);
    service = moduleRef.get(BillingCyclesService);
  });

  afterEach(async () => {
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  /** Fija el instante del reloj falso (solo las pruebas lo mueven; el código lee `Clock`). */
  function setNow(iso: string): void {
    jest.spyOn(clock, 'now').mockReturnValue(new Date(iso));
  }

  async function insertUser(): Promise<string> {
    userSeq += 1;
    const tag = `u${userSeq}`;
    const result = await inspect.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version)
       VALUES ($1, $2, $3, 'x', '\\x00', $4, now(), 'v1') RETURNING id`,
      [`Usuario ${tag}`, `${tag}@example.test`, `fp-${tag}`, `ci-${tag}`],
    );
    return (result.rows[0] as { id: string }).id;
  }

  interface TestGroup {
    id: string;
    ownerId: string;
    memberIds: string[];
  }

  /** Grupo en Bs 100,01 (10001 centavos) con `members` miembros además del titular. */
  async function createGroup(options: {
    createdAt: string;
    billingDay: number;
    members: number;
  }): Promise<TestGroup> {
    const ownerId = await insertUser();
    const memberIds: string[] = [];
    for (let i = 0; i < options.members; i++) memberIds.push(await insertUser());
    const client = await inspect.connect();
    try {
      await client.query('BEGIN');
      groupSeq += 1;
      // Alfabeto sin caracteres ambiguos (CHECK groups_invite_code_check).
      const code = `ABCDEF${INVITE_ALPHABET[groupSeq % 31]}${INVITE_ALPHABET[Math.floor(groupSeq / 31)]}`;
      const group = await client.query<{ id: string }>(
        `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                             billing_day, total_slots, invite_code, created_at)
         VALUES ($1, 'Grupo', 'Servicio', 10001, 'BS', $2, 5, $3, $4) RETURNING id`,
        [ownerId, options.billingDay, code, options.createdAt],
      );
      const id = (group.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'titular', 'creacion')`,
        [id, ownerId],
      );
      for (const userId of memberIds) {
        await client.query(
          `INSERT INTO group_members (group_id, user_id, role, join_source)
           VALUES ($1, $2, 'miembro', 'creacion')`,
          [id, userId],
        );
      }
      await client.query('COMMIT');
      return { id, ownerId, memberIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function cycles(groupId: string): Promise<CycleRow[]> {
    const result = await inspect.query<CycleRow>(
      `SELECT period, cycle_type, to_char(cut_date, 'YYYY-MM-DD') AS cut_date, member_count,
              base_share_cents::text, owner_share_cents::text, remainder_cents::text,
              total_bs_cents::text, issued_at, finalized_at
         FROM billing_cycles WHERE group_id = $1 ORDER BY period`,
      [groupId],
    );
    return result.rows;
  }

  async function charges(groupId: string): Promise<ChargeRow[]> {
    const result = await inspect.query<ChargeRow>(
      `SELECT user_id, period, status, origin, amount_cents::text, issued_at, due_at
         FROM charges WHERE group_id = $1 ORDER BY period, user_id`,
      [groupId],
    );
    return result.rows;
  }

  async function runGenerate(): Promise<{ processed: number; error_message: string | null }> {
    const results = await runner.runAll('manual', { job: 'billing.generate' });
    expect(results).toEqual([
      { job: 'billing.generate', status: 'ok', processed: expect.any(Number) },
    ]);
    const run = await inspect.query<{ processed_count: number; error_message: string | null }>(
      `SELECT processed_count, error_message FROM job_runs
        WHERE job_name = 'billing.generate' ORDER BY started_at DESC, created_at DESC LIMIT 1`,
    );
    const row = run.rows[0] as { processed_count: number; error_message: string | null };
    return { processed: row.processed_count, error_message: row.error_message };
  }

  it('CA-002-01: grupo de 3 miembros genera 2 cobros y la cuota de referencia del titular', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });

    const run = await runGenerate();

    expect(run.processed).toBe(1);
    const [cycle] = await cycles(group.id);
    expect(cycle).toMatchObject({
      period: '2026-10',
      cycle_type: 'regular',
      cut_date: '2026-10-15',
      member_count: 3,
      base_share_cents: '3333',
      owner_share_cents: '3335',
      remainder_cents: '2',
      total_bs_cents: '10001',
    });
    expect(cycle?.finalized_at).not.toBeNull();
    const rows = await charges(group.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id).sort()).toEqual([...group.memberIds].sort());
    for (const charge of rows) {
      expect(charge).toMatchObject({
        period: '2026-10',
        status: 'pendiente',
        origin: 'ciclo',
        amount_cents: '3333',
      });
      expect(charge.issued_at).toEqual(clock.now());
      // Emitido a tiempo: vence al inicio del día corte + 4 en La Paz (RF-002-03).
      expect(charge.due_at).toEqual(new Date('2026-10-19T04:00:00Z'));
    }
  });

  it('CA-002-01: publica ChargeGenerated por cada cobro dentro de la transacción', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    const seen: ChargeGenerated[] = [];
    bus.register<ChargeGenerated>('billing.charge-generated', (_tx, event) => {
      seen.push(event);
    });

    await db.withTransaction((tx) => service.ensureCurrentCycle(tx, group.id, clock.now()));

    expect(seen).toHaveLength(2);
    expect(seen.map((e) => e.userId).sort()).toEqual([...group.memberIds].sort());
    expect(seen[0]).toMatchObject({ groupId: group.id, period: '2026-10', amountCents: 3333 });
  });

  it('CA-002-01: si un manejador del evento falla, no queda ciclo ni cobros (misma transacción)', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    bus.register<ChargeGenerated>('billing.charge-generated', () => {
      throw new Error('fallo de prueba');
    });

    await expect(
      db.withTransaction((tx) => service.ensureCurrentCycle(tx, group.id, clock.now())),
    ).rejects.toThrow('fallo de prueba');

    expect(await charges(group.id)).toHaveLength(0);
    expect(await cycles(group.id)).toHaveLength(0);
  });

  it('CA-002-02: una segunda ejecución no duplica ciclos ni cobros', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });

    expect((await runGenerate()).processed).toBe(1);
    clock.advance(5 * 60 * 1000);
    expect((await runGenerate()).processed).toBe(0);

    expect(await cycles(group.id)).toHaveLength(1);
    expect(await charges(group.id)).toHaveLength(2);
  });

  it('CA-002-02: ejecuciones simultáneas (servicio y tarea) crean un solo ciclo y un cobro por miembro', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });

    const results = await Promise.all([
      db.withTransaction((tx) => service.ensureCurrentCycle(tx, group.id, clock.now())),
      db.withTransaction((tx) => service.ensureCurrentCycle(tx, group.id, clock.now())),
      db.withTransaction((tx) => service.ensureCurrentCycle(tx, group.id, clock.now())),
      runner.runAll('manual', { job: 'billing.generate' }),
    ]);

    expect(results.slice(0, 3).filter((r) => r !== null)).toHaveLength(1);
    expect(await cycles(group.id)).toHaveLength(1);
    expect(await charges(group.id)).toHaveLength(2);
  });

  it('CA-002-02: si otra ejecución tiene el bloqueo del grupo, la tarea lo omite sin esperar', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    const holder = await inspect.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `billing.generate:${group.id}`,
      ]);

      expect((await runGenerate()).processed).toBe(0);
      expect(await cycles(group.id)).toHaveLength(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    expect((await runGenerate()).processed).toBe(1);
    expect(await charges(group.id)).toHaveLength(2);
  });

  it('CA-002-03: día de cobro 31 en febrero corta el día 28 y genera el período 2026-02', async () => {
    const group = await createGroup({
      createdAt: '2026-02-01T16:00:00Z',
      billingDay: 31,
      members: 1,
    });

    // 27 de febrero 20:00 en La Paz: aún no es el corte (28) ni hubo uno posterior a la creación.
    setNow('2026-02-28T00:00:00Z');
    expect((await runGenerate()).processed).toBe(0);
    expect(await cycles(group.id)).toHaveLength(0);

    setNow('2026-02-28T04:30:00Z');
    expect((await runGenerate()).processed).toBe(1);

    const [cycle] = await cycles(group.id);
    expect(cycle).toMatchObject({ period: '2026-02', cut_date: '2026-02-28', member_count: 2 });
    const [charge] = await charges(group.id);
    expect(charge).toMatchObject({ period: '2026-02', amount_cents: '5000' });
    expect(charge?.due_at).toEqual(new Date('2026-03-04T04:00:00Z'));
  });

  it('CA-002-22: tras caerse en la fecha de corte se genera al volver, solo el último período, con aviso en job_runs', async () => {
    const group = await createGroup({
      createdAt: '2026-08-01T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    // Ciclo inicial de agosto; el servicio estuvo caído en los cortes de septiembre y octubre.
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.created',
        groupId: group.id,
        ownerId: group.ownerId,
      } as GroupCreated),
    );
    setNow('2026-10-17T10:00:00Z');

    const run = await runGenerate();

    expect(run.processed).toBe(1);
    const all = await cycles(group.id);
    expect(all.map((c) => `${c.period}:${c.cycle_type}`)).toEqual([
      '2026-08:inicial',
      '2026-10:regular',
    ]);
    expect(all[1]?.issued_at).toEqual(new Date('2026-10-17T10:00:00Z'));
    expect((await charges(group.id)).map((c) => c.period)).toEqual(['2026-10', '2026-10']);
    expect(run.error_message).toContain('faltaron períodos');
    expect(run.error_message).toContain(group.id);
  });

  it('CA-002-22: cobro emitido con más de un día de retraso vence a las 72 h de la emisión', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    setNow('2026-10-17T10:00:00Z');

    await runGenerate();

    for (const charge of await charges(group.id)) {
      expect(charge.issued_at).toEqual(new Date('2026-10-17T10:00:00Z'));
      expect(charge.due_at).toEqual(new Date('2026-10-20T10:00:00Z'));
    }
  });

  it('CA-002-28 y RF-002-03: el cobro emitido tarde no se marca atrasado hasta cumplir sus 72 h (T033)', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    setNow('2026-10-17T10:00:00Z');
    await runGenerate();
    const overdue = moduleRef.get(OverdueService);

    // El plazo normal (corte + 4, el 19 a las 00:00 de La Paz) ya pasó, pero la gracia no.
    setNow('2026-10-20T09:59:59Z');
    expect(await overdue.sweep(clock.now())).toBe(0);
    expect((await charges(group.id)).every((c) => c.status === 'pendiente')).toBe(true);

    setNow('2026-10-20T10:00:00Z');
    expect(await overdue.sweep(clock.now())).toBe(2);
    expect((await charges(group.id)).every((c) => c.status === 'atrasado')).toBe(true);
    const left = await inspect.query(
      `SELECT count(*)::int AS n FROM group_members
        WHERE group_id = $1 AND left_reason = 'mora'`,
      [group.id],
    );
    expect(left.rows[0].n).toBe(2);
  });

  it('RF-002-05 y R5: cerrado el grupo no se genera el siguiente período ni se marcan atrasos (T033)', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    setNow('2026-10-15T04:00:00Z');
    await runGenerate();
    await inspect.query(
      `UPDATE groups SET status = 'cerrado', closed_at = '2026-10-16T00:00:00Z' WHERE id = $1`,
      [group.id],
    );
    const overdue = moduleRef.get(OverdueService);

    setNow('2026-11-20T10:00:00Z');
    await runGenerate();
    expect(await overdue.sweep(clock.now())).toBe(0);

    expect(await cycles(group.id)).toHaveLength(1);
    expect((await charges(group.id)).every((c) => c.status === 'pendiente')).toBe(true);
  });

  it('CA-002-22: sin períodos perdidos no deja advertencia', async () => {
    await createGroup({ createdAt: '2026-09-02T16:00:00Z', billingDay: 15, members: 2 });

    expect((await runGenerate()).error_message).toBeNull();
  });

  it('RN-002-09: el ciclo inicial nace al crear el grupo, sin cobros, y se recalcula con ingresos y salidas', async () => {
    const group = await createGroup({
      createdAt: '2026-10-02T16:00:00Z',
      billingDay: 5,
      members: 0,
    });

    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.created',
        groupId: group.id,
        ownerId: group.ownerId,
      } as GroupCreated),
    );

    let [initial] = await cycles(group.id);
    expect(initial).toMatchObject({
      period: '2026-10',
      cycle_type: 'inicial',
      cut_date: '2026-10-02',
      member_count: 1,
      base_share_cents: '10001',
      owner_share_cents: '10001',
      finalized_at: null,
    });
    expect(await charges(group.id)).toHaveLength(0);

    const newcomer = await insertUser();
    await inspect.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'miembro', 'creacion')`,
      [group.id, newcomer],
    );
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.member-added',
        groupId: group.id,
        userId: newcomer,
      } as MemberAdded),
    );
    [initial] = await cycles(group.id);
    expect(initial).toMatchObject({
      member_count: 2,
      base_share_cents: '5000',
      owner_share_cents: '5001',
      remainder_cents: '1',
    });

    await inspect.query(
      `UPDATE group_members SET left_at = now(), left_reason = 'abandono'
        WHERE group_id = $1 AND user_id = $2`,
      [group.id, newcomer],
    );
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.member-removed',
        groupId: group.id,
        userId: newcomer,
        reason: 'abandono',
      } as MemberRemoved),
    );
    [initial] = await cycles(group.id);
    expect(initial).toMatchObject({ member_count: 1, base_share_cents: '10001' });
  });

  it('RN-002-09: GroupCreated repetido no duplica el ciclo inicial', async () => {
    const group = await createGroup({
      createdAt: '2026-10-02T16:00:00Z',
      billingDay: 5,
      members: 0,
    });
    const event = {
      type: 'groups.created',
      groupId: group.id,
      ownerId: group.ownerId,
    } as GroupCreated;

    await db.withTransaction((tx) => bus.publish(tx, event));
    await db.withTransaction((tx) => bus.publish(tx, event));

    expect(await cycles(group.id)).toHaveLength(1);
  });

  it('RN-002-09: un corte del mismo mes que el ciclo inicial no crea otro ciclo ni cobros', async () => {
    // Creado el día 2 con corte el 5 del mismo mes: el ingreso ya cubre ese período (R1 de la 001).
    const group = await createGroup({
      createdAt: '2026-10-02T16:00:00Z',
      billingDay: 5,
      members: 2,
    });
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.created',
        groupId: group.id,
        ownerId: group.ownerId,
      } as GroupCreated),
    );
    setNow('2026-10-05T05:00:00Z');

    expect((await runGenerate()).processed).toBe(0);

    const all = await cycles(group.id);
    expect(all).toHaveLength(1);
    expect(all[0]?.cycle_type).toBe('inicial');
    expect(all[0]?.finalized_at).toBeNull();
    expect(await charges(group.id)).toHaveLength(0);
  });

  it('RN-002-09: el primer ciclo regular finaliza el inicial y este deja de recalcularse', async () => {
    const group = await createGroup({
      createdAt: '2026-10-02T16:00:00Z',
      billingDay: 5,
      members: 2,
    });
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.created',
        groupId: group.id,
        ownerId: group.ownerId,
      } as GroupCreated),
    );
    setNow('2026-11-05T04:10:00Z');

    expect((await runGenerate()).processed).toBe(1);

    const all = await cycles(group.id);
    expect(all.map((c) => `${c.period}:${c.cycle_type}`)).toEqual([
      '2026-10:inicial',
      '2026-11:regular',
    ]);
    expect(all[0]?.finalized_at).not.toBeNull();
    expect(all[1]?.member_count).toBe(3);
    // El inicial finalizado ya no cambia con nuevos ingresos.
    await db.withTransaction((tx) =>
      bus.publish(tx, {
        type: 'groups.member-added',
        groupId: group.id,
        userId: group.memberIds[0] as string,
      } as MemberAdded),
    );
    expect((await cycles(group.id))[0]?.member_count).toBe(1);
  });

  it('RN-002-09 y RF-002-05: un grupo cerrado o congelado no genera ciclo ni cobros', async () => {
    const closed = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    const frozen = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    await inspect.query(
      `UPDATE groups SET status = 'cerrado', closed_at = '2026-10-01T00:00:00Z' WHERE id = $1`,
      [closed.id],
    );
    await inspect.query(
      `UPDATE groups SET frozen_at = '2026-10-01T00:00:00Z', frozen_reason = 'titular_baneado' WHERE id = $1`,
      [frozen.id],
    );

    expect((await runGenerate()).processed).toBe(0);
    // También si se invoca directamente (spec 010): el servicio mismo lo respeta.
    for (const id of [closed.id, frozen.id]) {
      expect(
        await db.withTransaction((tx) => service.ensureCurrentCycle(tx, id, clock.now())),
      ).toBeNull();
      expect(await cycles(id)).toHaveLength(0);
      expect(await charges(id)).toHaveLength(0);
    }
  });

  it('CA-002-22: un grupo que falla no impide procesar los demás y la tarea queda en error', async () => {
    const bad = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    const good = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });
    const original = service.ensureCurrentCycle.bind(service);
    jest.spyOn(service, 'ensureCurrentCycle').mockImplementation((tx, groupId, now) => {
      if (groupId === bad.id) return Promise.reject(new Error('fallo de prueba'));
      return original(tx, groupId, now);
    });

    const results = await runner.runAll('manual', { job: 'billing.generate' });

    expect(results[0]).toMatchObject({ job: 'billing.generate', status: 'error' });
    expect(await cycles(good.id)).toHaveLength(1);
    expect(await cycles(bad.id)).toHaveLength(0);
  });

  it('CA-002-22: cada tick evalúa el estado esperado: el corte se genera en el primer tick posterior', async () => {
    const group = await createGroup({
      createdAt: '2026-09-02T16:00:00Z',
      billingDay: 15,
      members: 2,
    });

    setNow('2026-10-15T03:55:00Z');
    expect((await runGenerate()).processed).toBe(1);
    expect((await cycles(group.id)).map((c) => c.period)).toEqual(['2026-09']);

    setNow('2026-10-15T04:00:00Z');
    expect((await runGenerate()).processed).toBe(1);
    expect((await cycles(group.id)).map((c) => c.period)).toEqual(['2026-09', '2026-10']);
    expect(await charges(group.id)).toHaveLength(4);
  });
});
