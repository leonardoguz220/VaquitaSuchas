import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { type DynamicModule, type INestApplication, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import { BillingModule } from '../../src/modules/billing/billing.module.js';
import { Clock } from '../../src/shared/clock/clock.js';
import { ClockModule } from '../../src/shared/clock/clock.module.js';
import { FakeClock } from '../../src/shared/clock/fake-clock.js';
import { DbModule } from '../../src/shared/db/db.module.js';
import { ErrorsModule } from '../../src/shared/errors/errors.module.js';
import { EventsModule } from '../../src/shared/events/events.module.js';
import { signHs256Jwt } from '../../src/shared/guards/jwt-hs256.js';
import { JobsModule } from '../../src/shared/jobs/jobs.module.js';
import {
  FileStorage,
  StorageError,
  StorageObjectNotFoundError,
  type PutOptions,
} from '../../src/shared/ports/file-storage.js';

// Soporte de las pruebas de integración de cobros (spec 002): PostgreSQL REAL con una base
// temporal propia (creada y borrada aquí), almacén de archivos en memoria y el módulo
// `billing` con sus guards reales. Credenciales por defecto: las de desarrollo local de
// docker-compose.yml (no son secretos).
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/migrations',
);
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const JWT_SECRET = 'secreto-e2e-de-al-menos-treinta-y-dos-caracteres';
/** Instante fijo de las pruebas: después del corte del 15 de octubre y antes del vencimiento. */
export const NOW = '2026-10-16T15:00:00.000Z';
export const DUE_AT = '2026-10-19T04:00:00.000Z';

/** Almacén en memoria con interruptores de falla, para probar la compensación y el 503. */
export class MemoryFileStorage extends FileStorage {
  readonly files = new Map<string, { body: Uint8Array; contentType: string }>();
  failPut = false;
  failSignedUrl = false;
  readonly deleted: string[] = [];

  put(key: string, body: Uint8Array, options: PutOptions): Promise<void> {
    if (this.failPut) return Promise.reject(new StorageError('falla simulada del almacén'));
    this.files.set(key, { body, contentType: options.contentType });
    return Promise.resolve();
  }

  copy(source: string, destination: string): Promise<void> {
    const file = this.files.get(source);
    if (!file) return Promise.reject(new StorageObjectNotFoundError());
    this.files.set(destination, file);
    return Promise.resolve();
  }

  signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (this.failSignedUrl) return Promise.reject(new StorageError('falla simulada del almacén'));
    if (!this.files.has(key)) return Promise.reject(new StorageObjectNotFoundError());
    return Promise.resolve(`https://storage.test/sign/${key}?ttl=${expiresInSeconds}`);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.files.has(key));
  }
}

/** Registra el almacén en memoria como `FileStorage` global, igual que `StorageModule.forRoot()`. */
export function memoryStorageModule(storage: MemoryFileStorage): DynamicModule {
  @Module({})
  class MemoryStorageModule {}
  return {
    module: MemoryStorageModule,
    global: true,
    providers: [{ provide: FileStorage, useValue: storage }],
    exports: [FileStorage],
  };
}

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

export interface TestGroup {
  id: string;
  ownerId: string;
  memberIds: string[];
  cycleId: string;
}

export interface TestChargeOptions {
  status?: 'pendiente' | 'en_revision' | 'atrasado';
  period?: string;
  dueAt?: string;
}

/**
 * Arranca la base temporal, aplica las migraciones y construye la aplicación. `start()` se llama
 * en `beforeAll` y `stop()` en `afterAll`; `clearData()` en `beforeEach` si la prueba lo necesita.
 */
export class BillingHarness {
  readonly databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  readonly storage = new MemoryFileStorage();
  readonly clock = new FakeClock(NOW);
  pool!: Pool;
  app!: INestApplication;
  private moduleRef!: TestingModule;
  private readonly originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JOBS_INPROCESS: process.env.JOBS_INPROCESS,
    JWT_SECRET: process.env.JWT_SECRET,
    FINGERPRINT_KEY: process.env.FINGERPRINT_KEY,
    CI_ENCRYPTION_KEY: process.env.CI_ENCRYPTION_KEY,
    TELEGRAM_MODE: process.env.TELEGRAM_MODE,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  private userSeq = 0;
  private groupSeq = 0;

  async start(): Promise<void> {
    try {
      await withAdminClient((client) => client.query(`CREATE DATABASE "${this.databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible: levanta la base con npm run db:up (o define TEST_DATABASE_URL).',
      );
    }
    const databaseUrl = urlForDatabase(this.databaseName);
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
    this.pool.on('error', () => undefined);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      await this.pool.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
    process.env.DATABASE_URL = databaseUrl;
    process.env.JOBS_INPROCESS = 'false';
    process.env.JWT_SECRET = JWT_SECRET;
    // AuthModule (registro, spec 003) arrastra identidad y el bot de Telegram en modo dev.
    process.env.FINGERPRINT_KEY = 'fingerprint-test-key';
    process.env.CI_ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.TELEGRAM_MODE = 'dev';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret-de-prueba';

    this.moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        ClockModule,
        DbModule,
        EventsModule,
        JobsModule,
        ErrorsModule,
        memoryStorageModule(this.storage),
        BillingModule,
      ],
    })
      .overrideProvider(Clock)
      .useValue(this.clock)
      .compile();
    this.app = this.moduleRef.createNestApplication({ logger: false });
    await this.app.init();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  }

  async stop(): Promise<void> {
    await this.app?.close();
    for (const key of Object.keys(this.originalEnv) as (keyof typeof this.originalEnv)[]) {
      if (this.originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = this.originalEnv[key];
    }
    await this.pool?.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${this.databaseName}" WITH (FORCE)`),
    );
  }

  /** JWT de sesión válido para la persona (la sesión se resuelve contra `users`). */
  token(userId: string): string {
    const iat = Math.floor(Date.parse(NOW) / 1000);
    return signHs256Jwt({ sub: userId, sv: 0, iat, exp: iat + 30 * 24 * 3600 }, JWT_SECRET);
  }

  async insertUser(name?: string): Promise<string> {
    this.userSeq += 1;
    const tag = `u${this.userSeq}`;
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version, verified_at,
                          phone_e164, telegram_user_id)
       VALUES ($1, $2, $3, 'x', '\\x00', $4, now(), 'v1', now(), $5, $6) RETURNING id`,
      [
        name ?? `Usuario ${tag}`,
        `${tag}@example.test`,
        `fp-${tag}`,
        `ci-${tag}`,
        `+5917${String(this.userSeq).padStart(7, '0')}`,
        1_000_000 + this.userSeq,
      ],
    );
    return (result.rows[0] as { id: string }).id;
  }

  /**
   * Grupo en Bs 100,01 con el titular y `members` miembros activos, y el ciclo regular de
   * 2026-10 (cuota base Bs 33,33; la del titular Bs 33,35).
   */
  async createGroup(options: { members: number; ownerName?: string }): Promise<TestGroup> {
    const ownerId = await this.insertUser(options.ownerName);
    const memberIds: string[] = [];
    for (let i = 0; i < options.members; i++) memberIds.push(await this.insertUser());
    this.groupSeq += 1;
    const code = `ABCDEF${INVITE_ALPHABET[this.groupSeq % 31]}${INVITE_ALPHABET[Math.floor(this.groupSeq / 31)]}`;
    // El titular activo debe existir al confirmar: grupo y miembros van en una transacción.
    const client = await this.pool.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      const group = await client.query<{ id: string }>(
        `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                             billing_day, total_slots, invite_code, created_at, payment_info_text)
         VALUES ($1, 'Grupo', 'Servicio', 10001, 'BS', 15, 5, $2, '2026-09-02T16:00:00Z',
                 'Transferir a la cuenta 123')
         RETURNING id`,
        [ownerId, code],
      );
      id = (group.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'titular', 'creacion')`,
        [id, ownerId],
      );
      for (const userId of memberIds) {
        // 'creacion': desde la migración 0055 'solicitud' exige una solicitud de ingreso real.
        await client.query(
          `INSERT INTO group_members (group_id, user_id, role, join_source)
           VALUES ($1, $2, 'miembro', 'creacion')`,
          [id, userId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const cycle = await this.pool.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, total_bs_cents, member_count,
                                   base_share_cents, owner_share_cents, remainder_cents,
                                   finalized_at)
       VALUES ($1, '2026-10', $2, 'regular', '2026-10-15', '2026-10-18', '2026-10-15T04:00:00Z',
               10001, 'BS', 10001, 3, 3333, 3335, 2, '2026-10-15T04:00:00Z')
       RETURNING id`,
      // El ciclo siempre es de 3 cuotas: la suma debe cuadrar con el total (CHECK).
      [id, ownerId],
    );
    return { id, ownerId, memberIds, cycleId: (cycle.rows[0] as { id: string }).id };
  }

  async insertCharge(
    group: TestGroup,
    userId: string,
    options: TestChargeOptions = {},
  ): Promise<string> {
    const period = options.period ?? '2026-10';
    const cycleId = period === '2026-10' ? group.cycleId : await this.insertCycleFor(group, period);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, status, amount_cents,
                            price_cents, currency, total_bs_cents, member_count, issued_at, due_at)
       VALUES ($1, $2, $3, $4, 'ciclo', 'pendiente', 3333, 10001, 'BS', 10001, 3,
               '2026-10-15T04:00:00Z', $5)
       RETURNING id`,
      [group.id, userId, cycleId, period, options.dueAt ?? DUE_AT],
    );
    const id = (result.rows[0] as { id: string }).id;
    if (options.status && options.status !== 'pendiente') {
      if (options.status === 'en_revision') {
        await this.pool.query(
          `UPDATE charges SET status = 'en_revision', first_submitted_at = $2 WHERE id = $1`,
          [id, NOW],
        );
      } else {
        await this.pool.query(`UPDATE charges SET status = 'atrasado' WHERE id = $1`, [id]);
      }
    }
    return id;
  }

  private async insertCycleFor(group: TestGroup, period: string): Promise<string> {
    const [year, month] = period.split('-').map(Number) as [number, number];
    const cut = `${year}-${String(month).padStart(2, '0')}-15`;
    const due = `${year}-${String(month).padStart(2, '0')}-18`;
    const cycle = await this.pool.query<{ id: string }>(
      `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                   issued_at, price_cents, currency, total_bs_cents, member_count,
                                   base_share_cents, owner_share_cents, remainder_cents,
                                   finalized_at)
       VALUES ($1, $2, $3, 'regular', $4, $5, $6, 10001, 'BS', 10001, 3, 3333, 3335, 2, $6)
       RETURNING id`,
      [group.id, period, group.ownerId, cut, due, `${cut}T04:00:00Z`],
    );
    return (cycle.rows[0] as { id: string }).id;
  }

  /** El miembro deja el grupo (queda como retirado). */
  async leaveGroup(groupId: string, userId: string, reason = 'abandono'): Promise<void> {
    await this.pool.query(
      `UPDATE group_members SET left_at = now(), left_reason = $3
        WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId, reason],
    );
  }

  async freezeGroup(groupId: string): Promise<void> {
    await this.pool.query(
      `UPDATE groups SET frozen_at = now(), frozen_reason = 'titular_baneado' WHERE id = $1`,
      [groupId],
    );
  }

  /** Inserta un comprobante vigente ya guardado en el almacén en memoria. */
  async insertReceipt(
    chargeId: string,
    uploadedBy: string,
    options: { reference?: string; fileKey?: string } = {},
  ): Promise<{ id: string; fileKey: string }> {
    const fileKey = options.fileKey ?? `receipts/test/${chargeId}/${randomUUID()}.png`;
    this.storage.files.set(fileKey, {
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/png',
    });
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO receipts (charge_id, uploaded_by, file_key, mime, size_bytes, method, reference)
       VALUES ($1, $2, $3, 'image/png', 4, 'qr', $4) RETURNING id`,
      [chargeId, uploadedBy, fileKey, options.reference ?? 'REF-1'],
    );
    return { id: (result.rows[0] as { id: string }).id, fileKey };
  }
}
