import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface GroupFacts {
  name: string;
  ownerId: string;
  paymentInfo: string | null;
}

export interface ChargeFacts {
  amountCents: number;
  dueAt: Date;
  period: string;
}

/**
 * Lecturas de solo consulta que necesitan los manejadores de avisos para armar el texto
 * (nombres, montos, datos de pago). Corren en la transacción del hecho que origina el aviso.
 */
@Injectable()
export class NotificationFactsRepository {
  async group(q: Queryable, groupId: string): Promise<GroupFacts | null> {
    const result = await q.query<{
      name: string;
      owner_id: string;
      payment_info_text: string | null;
    }>('SELECT name, owner_id, payment_info_text FROM groups WHERE id = $1', [groupId]);
    const row = result.rows[0];
    return row
      ? { name: row.name, ownerId: row.owner_id, paymentInfo: row.payment_info_text }
      : null;
  }

  async userName(q: Queryable, userId: string): Promise<string> {
    const result = await q.query<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.full_name ?? 'Un usuario';
  }

  async charge(q: Queryable, chargeId: string): Promise<ChargeFacts | null> {
    const result = await q.query<{ amount_cents: string; due_at: Date; period: string }>(
      'SELECT amount_cents, due_at, period FROM charges WHERE id = $1',
      [chargeId],
    );
    const row = result.rows[0];
    return row
      ? { amountCents: Number(row.amount_cents), dueAt: row.due_at, period: row.period }
      : null;
  }

  /** Miembros activos del grupo sin el titular. */
  async memberIds(q: Queryable, groupId: string): Promise<string[]> {
    const result = await q.query<{ user_id: string }>(
      `SELECT user_id FROM group_members
        WHERE group_id = $1 AND left_at IS NULL AND role <> 'titular'`,
      [groupId],
    );
    return result.rows.map((r) => r.user_id);
  }

  /** Grupos activos (no cerrados) cuyo titular es `userId`. */
  async ownedActiveGroupIds(q: Queryable, userId: string): Promise<string[]> {
    const result = await q.query<{ id: string }>(
      `SELECT id FROM groups WHERE owner_id = $1 AND status = 'activo'`,
      [userId],
    );
    return result.rows.map((r) => r.id);
  }

  async requestPaymentText(q: Queryable, requestId: string): Promise<string | null> {
    const result = await q.query<{ payment_text: string | null }>(
      'SELECT payment_text FROM join_requests WHERE id = $1',
      [requestId],
    );
    return result.rows[0]?.payment_text ?? null;
  }

  /** Último mensaje leído por el destinatario en la solicitud (0 si nunca abrió el chat). */
  async lastReadSeq(q: Queryable, requestId: string, userId: string): Promise<number> {
    const result = await q.query<{ last_read_seq: string }>(
      'SELECT last_read_seq FROM join_request_reads WHERE request_id = $1 AND user_id = $2',
      [requestId, userId],
    );
    return Number(result.rows[0]?.last_read_seq ?? 0);
  }
}
