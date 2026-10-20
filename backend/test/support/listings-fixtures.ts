import { randomBytes } from 'node:crypto';
import type { BillingHarness } from './billing-harness.js';

export const LISTING_PUBLISHED_AT = '2026-10-10T12:00:00.000Z';

export interface SeedListingOptions {
  serviceName?: string;
  /** Miembros además del titular. */
  extraMembers?: number;
  totalBsCents?: number;
  totalSlots?: number;
  offered?: number;
  /** 15 deja la ventana abierta en `NOW` (16/10); 5 la deja cerrada. */
  billingDay?: number;
  publishedAt?: string;
  expiresAt?: string;
  ownerName?: string;
  ownerId?: string;
  description?: string | null;
  conditions?: string | null;
  acceptingMembers?: boolean;
  status?: 'activa' | 'oculta' | 'expirada';
  /** Plan del catálogo: la copia (servicio, plan, categoría) sale de él. */
  planId?: string;
  paymentText?: string;
}

export interface SeededListing {
  listingId: string;
  groupId: string;
  ownerId: string;
  memberIds: string[];
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const inviteCode = (): string =>
  Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');

/** Servicio y plan de catálogo mínimos; devuelve los ids. */
export async function seedCatalogPlan(
  harness: BillingHarness,
  name: string,
  category = 'video',
): Promise<{ serviceId: string; planId: string }> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(3).toString('hex')}`;
  const service = await harness.pool.query<{ id: string }>(
    `INSERT INTO catalog_services (slug, name, category) VALUES ($1, $2, $3) RETURNING id`,
    [slug, `${name} ${randomBytes(2).toString('hex')}`, category],
  );
  const serviceId = (service.rows[0] as { id: string }).id;
  const plan = await harness.pool.query<{ id: string }>(
    `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots)
     VALUES ($1, $2, 'Premium', 5000, 'BS', 10) RETURNING id`,
    [serviceId, `${slug}-plan`],
  );
  return { serviceId, planId: (plan.rows[0] as { id: string }).id };
}

/** Grupo con titular y miembros, y su publicación (insertada tal cual; los disparadores validan). */
export async function seedListing(
  harness: BillingHarness,
  options: SeedListingOptions = {},
): Promise<SeededListing> {
  const ownerId = options.ownerId ?? (await harness.insertUser(options.ownerName));
  const memberIds: string[] = [];
  for (let i = 0; i < (options.extraMembers ?? 0); i++) memberIds.push(await harness.insertUser());
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, catalog_plan_id,
                           plan_name_snapshot, price_cents, currency, billing_day, total_slots,
                           invite_code, created_at, payment_info_text, accepting_members)
       VALUES ($1, 'Grupo', COALESCE((SELECT cs.name FROM catalog_plans cp
                                       JOIN catalog_services cs ON cs.id = cp.service_id
                                      WHERE cp.id = $2::uuid), $3),
               $2::uuid, CASE WHEN $2::uuid IS NULL THEN NULL ELSE 'Premium' END,
               $4, 'BS', $5, $6, $7, '2026-09-02T16:00:00Z', $8, $9)
       RETURNING id`,
      [
        ownerId,
        options.planId ?? null,
        options.serviceName ?? 'Servicio',
        options.totalBsCents ?? 9000,
        options.billingDay ?? 15,
        options.totalSlots ?? 5,
        inviteCode(),
        options.paymentText ?? 'Transferir a la cuenta 123',
        options.acceptingMembers ?? true,
      ],
    );
    const groupId = (group.rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'titular', 'creacion')`,
      [groupId, ownerId],
    );
    for (const userId of memberIds) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, join_source)
         VALUES ($1, $2, 'miembro', 'creacion')`,
        [groupId, userId],
      );
    }
    const publishedAt = options.publishedAt ?? LISTING_PUBLISHED_AT;
    const expiresAt =
      options.expiresAt ?? new Date(Date.parse(publishedAt) + 30 * 86_400_000).toISOString();
    const listing = await client.query<{ id: string }>(
      `INSERT INTO listings (group_id, slots_offered, description, conditions, published_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        groupId,
        options.offered ?? 1,
        options.description ?? null,
        options.conditions ?? null,
        publishedAt,
        expiresAt,
      ],
    );
    const listingId = (listing.rows[0] as { id: string }).id;
    if (options.status === 'oculta') {
      await client.query(`UPDATE listings SET status = 'oculta', hidden_at = now() WHERE id = $1`, [
        listingId,
      ]);
    } else if (options.status === 'expirada') {
      await client.query(`UPDATE listings SET status = 'expirada' WHERE id = $1`, [listingId]);
    }
    await client.query('COMMIT');
    return { listingId, groupId, ownerId, memberIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Calificación del titular (tabla de la spec 007) para ordenar por puntualidad. */
export async function seedReputation(
  harness: BillingHarness,
  userId: string,
  level: 'Regular' | 'Bueno' | 'Excelente',
  halfStars: number,
): Promise<void> {
  await harness.pool.query(
    `INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                                  displayed_half_stars, level, current_streak, rules_version,
                                  computed_at)
     VALUES ($1, 10, 10, 0, $2, $3, 3, 1, now())`,
    [userId, halfStars, level],
  );
}

/** `count` publicaciones activas de grupos distintos, con una sola transacción (rendimiento). */
export async function seedBulkListings(harness: BillingHarness, count: number): Promise<void> {
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version, verified_at,
                          phone_e164, telegram_user_id)
       SELECT 'Titular ' || i, 'bulk' || i || '@example.test', 'bulk-fp-' || i, 'x', '\\x00',
              'bulk-ci-' || i, now(), 'v1', now(), '+5917' || lpad((5000000 + i)::text, 7, '0'),
              5000000 + i
         FROM generate_series(1, $1::int) AS i`,
      [count],
    );
    await client.query(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code, created_at)
       SELECT u.id, 'Grupo', CASE WHEN n % 10 = 0 THEN 'Netflix' ELSE 'Servicio ' || (n % 7) END,
              5000 + (n % 50) * 100, 'BS', 15, 5,
              translate(upper(substr(md5('bulk' || n), 1, 8)), '01', 'GH'),
              '2026-09-02T16:00:00Z'
         FROM (SELECT id, row_number() OVER (ORDER BY email) AS n FROM users
                WHERE email LIKE 'bulk%@example.test') u`,
    );
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       SELECT g.id, g.owner_id, 'titular', 'creacion' FROM groups g
        JOIN users u ON u.id = g.owner_id WHERE u.email LIKE 'bulk%@example.test'`,
    );
    await client.query(
      `INSERT INTO listings (group_id, slots_offered, published_at, expires_at)
       SELECT g.id, 1, '2026-10-10T12:00:00Z'::timestamptz - (row_number() OVER (ORDER BY g.id)) * interval '1 second',
              '2026-11-09T12:00:00Z'::timestamptz
         FROM groups g JOIN users u ON u.id = g.owner_id WHERE u.email LIKE 'bulk%@example.test'`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
