import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface DueInvitation {
  id: string;
  attempts: number;
  recipientEmail: string;
  groupStatus: 'activo' | 'cerrado';
  groupFrozen: boolean;
  groupName: string;
  inviteCode: string;
  inviterName: string;
}

interface DueRow {
  id: string;
  attempts: number;
  recipient_email: string;
  group_status: 'activo' | 'cerrado';
  frozen_at: Date | null;
  group_name: string;
  invite_code: string;
  inviter_name: string | null;
}

/** Único lugar con SQL sobre `group_invitations` (0073): el buzón de salida de invitaciones. */
@Injectable()
export class InvitationsRepository {
  /** Serializa las invitaciones de una misma persona dentro de la transacción (límite por hora). */
  async lockInviter(q: Queryable, keyHash: string): Promise<void> {
    await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `invite:user:${keyHash}`,
    ]);
  }

  async insert(
    q: Queryable,
    input: { groupId: string; invitedBy: string; email: string; now: Date },
  ): Promise<void> {
    await q.query(
      `INSERT INTO group_invitations (group_id, invited_by, recipient_email, next_attempt_at)
       VALUES ($1, $2, $3, $4)`,
      [input.groupId, input.invitedBy, input.email, input.now],
    );
  }

  /** Lote de invitaciones pendientes que ya tocan, bloqueadas para esta transacción. */
  async claimDue(q: Queryable, now: Date, limit: number): Promise<DueInvitation[]> {
    const result = await q.query<DueRow>(
      `SELECT i.id, i.attempts, i.recipient_email, g.status AS group_status, g.frozen_at,
              g.name AS group_name, g.invite_code, u.full_name AS inviter_name
         FROM group_invitations i
         JOIN groups g ON g.id = i.group_id
         JOIN users u ON u.id = i.invited_by
        WHERE i.status = 'pendiente' AND i.next_attempt_at <= $1
        ORDER BY i.next_attempt_at, i.id
        LIMIT $2
          FOR UPDATE OF i SKIP LOCKED`,
      [now, limit],
    );
    return result.rows.map((r) => ({
      id: r.id,
      attempts: r.attempts,
      recipientEmail: r.recipient_email,
      groupStatus: r.group_status,
      groupFrozen: r.frozen_at !== null,
      groupName: r.group_name,
      inviteCode: r.invite_code,
      inviterName: r.inviter_name ?? 'Un titular de Vaquita',
    }));
  }

  async markSent(q: Queryable, id: string, now: Date, attempts: number): Promise<void> {
    await q.query(
      `UPDATE group_invitations SET status = 'enviada', sent_at = $2, attempts = $3 WHERE id = $1`,
      [id, now, attempts],
    );
  }

  async markFailed(q: Queryable, id: string, attempts: number): Promise<void> {
    await q.query(`UPDATE group_invitations SET status = 'fallida', attempts = $2 WHERE id = $1`, [
      id,
      attempts,
    ]);
  }

  async reschedule(q: Queryable, id: string, attempts: number, next: Date): Promise<void> {
    await q.query(
      `UPDATE group_invitations SET attempts = $2, next_attempt_at = $3 WHERE id = $1`,
      [id, attempts, next],
    );
  }
}
