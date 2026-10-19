import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';
import { buildCycle, chargeFromCycle } from '../src/modules/billing/domain/cycle-calculation.js';
import { ChargeEventsRepository } from '../src/modules/billing/repositories/events.repository.js';
import { ChargesRepository } from '../src/modules/billing/repositories/charges.repository.js';
import { CyclesRepository } from '../src/modules/billing/repositories/cycles.repository.js';
import { PaymentReferencesRepository } from '../src/modules/billing/repositories/payment-references.repository.js';
import { ReceiptsRepository } from '../src/modules/billing/repositories/receipts.repository.js';

// Repositorios de billing contra PostgreSQL REAL (T011, RNF-002-04): los nombres de columna deben
// coincidir con las migraciones 0040-0044. Usa una base temporal propia, creada y borrada aquí.
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);

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

describe('Repositorios de billing contra PostgreSQL real', () => {
  const databaseName = `vaquita_t_${randomBytes(6).toString('hex')}`;
  const cycles = new CyclesRepository();
  const charges = new ChargesRepository();
  const receipts = new ReceiptsRepository();
  const events = new ChargeEventsRepository();
  const references = new PaymentReferencesRepository();
  let pool: Pool;
  let groupId: string;
  let ownerId: string;
  let memberId: string;
  const cut = { year: 2026, month: 10, day: 15 };
  const issuedAt = new Date('2026-10-15T04:00:00Z');

  async function insertUser(tag: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version)
       VALUES ($1, $2, $3, 'x', '\\x00', $4, now(), 'v1') RETURNING id`,
      [`Usuario ${tag}`, `${tag}@example.test`, `fp-${tag}`, `ci-${tag}`],
    );
    return (result.rows[0] as { id: string }).id;
  }

  beforeAll(async () => {
    try {
      await withAdminClient((client) => client.query(`CREATE DATABASE "${databaseName}"`));
    } catch {
      throw new Error(
        'No hay una PostgreSQL accesible: levanta la base con npm run db:up (o define TEST_DATABASE_URL).',
      );
    }
    pool = new Pool({ connectionString: urlForDatabase(databaseName), max: 3 });
    pool.on('error', () => undefined);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      await pool.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
    ownerId = await insertUser('owner');
    memberId = await insertUser('member');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const group = await client.query<{ id: string }>(
        `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                             exchange_rate, billing_day, total_slots, invite_code)
         VALUES ($1, 'Grupo', 'Servicio', 1599, 'USD', 6.96, 15, 4, 'ABCDEFGH') RETURNING id`,
        [ownerId],
      );
      groupId = (group.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'titular', 'creacion'), ($1, $3, 'miembro', 'solicitud')`,
        [groupId, ownerId, memberId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await withAdminClient((client) =>
      client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
    );
  }, 30_000);

  it('RN-002-09, CA-002-22: el ciclo se guarda con su copia y no se duplica por grupo y período', async () => {
    const draft = buildCycle(
      { ownerId, priceCents: 1599, currency: 'USD', exchangeRate: '6.96' },
      4,
      cut,
      issuedAt,
    );
    const saved = await cycles.insert(pool, groupId, draft);
    expect(saved).toMatchObject({
      groupId,
      period: '2026-10',
      cutDate: cut,
      dueDate: { year: 2026, month: 10, day: 18 },
      totalBsCents: 11_129,
      baseShareCents: 2782,
      ownerShareCents: 2783,
      exchangeRate: '6.9600',
    });
    expect(saved?.finalizedAt).not.toBeNull();
    expect(await cycles.insert(pool, groupId, draft)).toBeNull();
    expect((await cycles.findLatest(pool, groupId))?.id).toBe(saved?.id);
  });

  it('RF-002-04, CA-002-22: el cobro copia el ciclo, es único por miembro y período y se actualiza con FOR UPDATE', async () => {
    const cycle = await cycles.findByGroupAndPeriod(pool, groupId, '2026-10');
    if (!cycle) throw new Error('falta el ciclo');
    const draft = chargeFromCycle(cycle, memberId, issuedAt);
    const charge = await charges.insertFromCycle(pool, groupId, cycle.id, draft);
    expect(charge).toMatchObject({
      status: 'pendiente',
      amountCents: 2782,
      totalBsCents: 11_129,
      dueAt: new Date('2026-10-19T04:00:00Z'),
      version: 1,
    });
    expect(await charges.insertFromCycle(pool, groupId, cycle.id, draft)).toBeNull();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await charges.findByIdForUpdate(client, (charge as { id: string }).id);
      expect(locked?.status).toBe('pendiente');
      const updated = await charges.updateStatus(
        client,
        (charge as { id: string }).id,
        'en_revision',
        {
          firstSubmittedAt: new Date('2026-10-16T12:00:00Z'),
        },
      );
      expect(updated).toMatchObject({ status: 'en_revision', version: 2 });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const rejected = await charges.updateStatus(pool, (charge as { id: string }).id, 'pendiente');
    expect(rejected.firstSubmittedAt).toEqual(new Date('2026-10-16T12:00:00Z'));
    expect(await charges.listByUser(pool, memberId, ['pendiente'])).toHaveLength(1);
    expect(await charges.listByUser(pool, memberId, ['pagado'])).toHaveLength(0);
    expect(await charges.listByGroupPeriod(pool, groupId, '2026-10')).toHaveLength(1);
    const overdue = await charges.listOverdueForUpdate(
      pool,
      new Date('2026-10-19T04:00:00Z'),
      groupId,
    );
    expect(overdue.map((c) => c.id)).toEqual([(charge as { id: string }).id]);
  });

  it('RF-002-06, RF-002-08, CA-002-27: comprobante vigente único y referencia reservada por grupo', async () => {
    const charge = (await charges.listByGroupPeriod(pool, groupId, '2026-10'))[0];
    if (!charge) throw new Error('falta el cobro');
    const input = {
      chargeId: charge.id,
      uploadedBy: memberId,
      fileKey: `receipts/${groupId}/${charge.id}/a.jpg`,
      mime: 'image/jpeg' as const,
      sizeBytes: 1024,
      method: 'qr' as const,
      reference: 'ab 123',
    };
    const first = await receipts.insert(pool, input);
    expect(first.status).toBe('vigente');
    await expect(
      receipts.insert(pool, { ...input, fileKey: `${input.fileKey}.2` }),
    ).rejects.toThrow();
    expect((await receipts.findActiveByCharge(pool, charge.id))?.id).toBe(first.id);

    const key = {
      groupId,
      referenceKey: 'AB 123',
      sourceType: 'receipt' as const,
      sourceId: first.id,
    };
    expect(await references.reserve(pool, key)).toBe(true);
    expect(await references.reserve(pool, { ...key, sourceId: memberId })).toBe(false);
    expect(await references.isReserved(pool, groupId, 'AB 123')).toBe(true);

    expect(await receipts.setStatus(pool, first.id, 'rechazado')).toBe(true);
    expect(await references.release(pool, 'receipt', first.id, new Date())).toBe(1);
    expect(await references.reserve(pool, { ...key, sourceId: memberId })).toBe(true);
    expect(await receipts.markFileDeleted(pool, first.id, new Date())).toBe(true);
    expect(await receipts.listByCharge(pool, charge.id)).toHaveLength(1);
  });

  it('RF-002-17, RNF-002-04: la línea de tiempo se anexa y se lista en orden', async () => {
    const charge = (await charges.listByGroupPeriod(pool, groupId, '2026-10'))[0];
    if (!charge) throw new Error('falta el cobro');
    await events.append(pool, {
      chargeId: charge.id,
      groupId,
      type: 'generado',
      actorId: null,
      toStatus: 'pendiente',
      occurredAt: new Date('2026-10-15T04:00:00Z'),
    });
    await events.append(pool, {
      chargeId: charge.id,
      groupId,
      type: 'rechazado',
      actorId: ownerId,
      fromStatus: 'en_revision',
      toStatus: 'pendiente',
      reason: 'Monto incorrecto',
      metadata: { invalidReceipt: true },
      occurredAt: new Date('2026-10-17T04:00:00Z'),
    });
    const timeline = await events.listByCharge(pool, charge.id);
    expect(timeline.map((e) => e.type)).toEqual(['generado', 'rechazado']);
    expect(timeline[0]).toMatchObject({ actorKind: 'sistema', actorId: null });
    expect(timeline[1]).toMatchObject({
      actorKind: 'usuario',
      actorId: ownerId,
      metadata: { invalidReceipt: true },
    });
    const page = await events.listByGroup(pool, groupId, 1);
    expect(page.map((e) => e.type)).toEqual(['rechazado']);
    expect(await events.listByGroup(pool, groupId, 10, page[0]?.occurredAt)).toHaveLength(1);
  });
});
