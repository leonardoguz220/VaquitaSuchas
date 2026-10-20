import { randomBytes } from 'node:crypto';
import { TxEventBus } from '../../src/shared/events/tx-event-bus.js';
import type { DomainEvent } from '../../src/shared/events/domain-event.js';
import { DbService } from '../../src/shared/db/db.service.js';
import type { AuthTestApp } from './auth-app.js';

// Datos mínimos para probar los manejadores de avisos (spec 005): se insertan por SQL y los eventos
// se publican por el bus real dentro de una transacción, como hacen las demás specs.

export interface NotifRow {
  type: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  user_id: string;
}

export async function setName(t: AuthTestApp, userId: string, name: string): Promise<void> {
  await t.db.query('UPDATE users SET full_name = $2 WHERE id = $1', [userId, name]);
}

export async function insertGroup(
  t: AuthTestApp,
  ownerId: string,
  memberIds: string[],
  name = 'Netflix Familiar',
  paymentInfo: string | null = 'Transferir a la cuenta 123',
): Promise<string> {
  const code = Array.from(randomBytes(8), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join(
    '',
  );
  const client = await t.db.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code, payment_info_text)
       VALUES ($1, $2, 'Servicio', 10001, 'BS', 15, 5, $3, $4) RETURNING id`,
      [ownerId, name, code, paymentInfo],
    );
    const id = group.rows[0]!.id;
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
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function insertCharge(
  t: AuthTestApp,
  groupId: string,
  ownerId: string,
  userId: string,
  amountCents = 3333,
): Promise<string> {
  const cycle = await t.db.query<{ id: string }>(
    `INSERT INTO billing_cycles (group_id, period, owner_id, cycle_type, cut_date, due_date,
                                 issued_at, price_cents, currency, total_bs_cents, member_count,
                                 base_share_cents, owner_share_cents, remainder_cents, finalized_at)
     VALUES ($1, '2026-10', $2, 'regular', '2026-10-15', '2026-10-18', '2026-10-15T04:00:00Z',
             10001, 'BS', 10001, 3, 3333, 3335, 2, '2026-10-15T04:00:00Z')
     RETURNING id`,
    [groupId, ownerId],
  );
  const charge = await t.db.query<{ id: string }>(
    `INSERT INTO charges (group_id, user_id, cycle_id, period, origin, amount_cents, price_cents,
                          currency, total_bs_cents, member_count, issued_at, due_at)
     VALUES ($1, $2, $3, '2026-10', 'ciclo', $4, 10001, 'BS', 10001, 3,
             '2026-10-15T04:00:00Z', '2026-10-19T04:00:00Z')
     RETURNING id`,
    [groupId, userId, cycle.rows[0]!.id, amountCents],
  );
  return charge.rows[0]!.id;
}

export async function insertRequest(
  t: AuthTestApp,
  groupId: string,
  applicantId: string,
  paymentText: string | null = null,
): Promise<string> {
  const request = await t.db.query<{ id: string }>(
    `INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at, payment_text)
     VALUES ($1, $2, '2026-10-16T15:00:00Z', '2026-10-17T15:00:00Z', $3) RETURNING id`,
    [groupId, applicantId, paymentText],
  );
  return request.rows[0]!.id;
}

export async function publish(t: AuthTestApp, ...events: DomainEvent[]): Promise<void> {
  const bus = t.app.get(TxEventBus, { strict: false });
  await t.app.get(DbService, { strict: false }).withTransaction(async (tx) => {
    for (const event of events) await bus.publish(tx, event);
  });
}

export async function notificationsOf(t: AuthTestApp, userId: string): Promise<NotifRow[]> {
  const result = await t.db.query<NotifRow>(
    `SELECT type, category, title, body, link, user_id FROM notifications
      WHERE user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return result.rows;
}
