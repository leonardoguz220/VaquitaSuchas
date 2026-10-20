import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { SubscriptionMembershipQuery } from '../ports/subscription-membership-query.port.js';

/** Implementa `SubscriptionMembershipQuery` leyendo `group_members` (solo lectura, estadías activas). */
@Injectable()
export class MembershipRepository implements SubscriptionMembershipQuery {
  async groupIdsOf(q: Queryable, userId: string): Promise<string[]> {
    const result = await q.query<{ group_id: string }>(
      `SELECT group_id FROM group_members WHERE user_id = $1 AND left_at IS NULL`,
      [userId],
    );
    return result.rows.map((row) => row.group_id);
  }

  async isOwner(q: Queryable, userId: string, groupId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM group_members
        WHERE group_id = $1 AND user_id = $2 AND role = 'titular' AND left_at IS NULL`,
      [groupId, userId],
    );
    return result.rows.length > 0;
  }
}
