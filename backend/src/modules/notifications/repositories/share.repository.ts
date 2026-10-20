import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface ReminderFacts {
  groupId: string;
  groupName: string;
  userId: string;
  memberName: string | null;
  phone: string | null;
  status: string;
  amountCents: number;
  period: string;
  dueAt: Date;
  memberIsActive: boolean;
}

interface ReminderRow {
  group_id: string;
  group_name: string;
  user_id: string;
  full_name: string | null;
  phone_e164: string | null;
  status: string;
  amount_cents: string;
  period: string;
  due_at: Date;
  member_is_active: boolean;
}

/** Lecturas para los textos de WhatsApp (RF-005-15, RF-005-16); no escribe nada. */
@Injectable()
export class ShareRepository {
  async inviteFacts(
    q: Queryable,
    groupId: string,
  ): Promise<{ name: string; inviteCode: string } | null> {
    const result = await q.query<{ name: string; invite_code: string }>(
      'SELECT name, invite_code FROM groups WHERE id = $1',
      [groupId],
    );
    const row = result.rows[0];
    return row ? { name: row.name, inviteCode: row.invite_code } : null;
  }

  async reminderFacts(q: Queryable, chargeId: string): Promise<ReminderFacts | null> {
    const result = await q.query<ReminderRow>(
      `SELECT c.group_id, g.name AS group_name, c.user_id, u.full_name, u.phone_e164, c.status,
              c.amount_cents::text AS amount_cents, c.period, c.due_at,
              EXISTS (SELECT 1 FROM group_members m
                       WHERE m.group_id = c.group_id AND m.user_id = c.user_id
                         AND m.left_at IS NULL) AS member_is_active
         FROM charges c
         JOIN groups g ON g.id = c.group_id
         JOIN users u ON u.id = c.user_id
        WHERE c.id = $1`,
      [chargeId],
    );
    const r = result.rows[0];
    if (!r) return null;
    return {
      groupId: r.group_id,
      groupName: r.group_name,
      userId: r.user_id,
      memberName: r.full_name,
      phone: r.phone_e164,
      status: r.status,
      amountCents: Number(r.amount_cents),
      period: r.period,
      dueAt: r.due_at,
      memberIsActive: r.member_is_active,
    };
  }
}
