import { randomInt } from 'node:crypto';
import type { BillingHarness } from './billing-harness.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Grupo activo de otro servicio cuyo titular es `ownerId` (para probar el tope de 5, RN-001-14). */
export async function insertOwnedGroup(harness: BillingHarness, ownerId: string): Promise<string> {
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code)
       VALUES ($1, 'Otro grupo', 'Servicio', 10001, 'BS', 15, 5, $2) RETURNING id`,
      [ownerId, code],
    );
    const id = (group.rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'titular', 'creacion')`,
      [id, ownerId],
    );
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
