import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { MemberRemovedReason } from '../../../shared/events/group-events.js';

export type MemberRole = 'titular' | 'miembro';

export interface MemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: Date;
}

export interface MemberDetailRow extends MemberRow {
  full_name: string;
  phone_e164: string | null;
}

/** Único lugar con SQL sobre `group_members` (0031_group_members.sql). */
@Injectable()
export class MembersRepository {
  async insert(
    q: Queryable,
    input: {
      groupId: string;
      userId: string;
      role: MemberRole;
      joinSource: 'creacion' | 'solicitud';
      joinRequestId?: string | null;
    },
  ): Promise<MemberRow> {
    const result = await q.query<MemberRow>(
      `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, group_id, user_id, role, joined_at`,
      [input.groupId, input.userId, input.role, input.joinSource, input.joinRequestId ?? null],
    );
    return result.rows[0] as MemberRow;
  }

  /** Fila activa (sin `left_at`) de la persona en el grupo. */
  async findActive(q: Queryable, groupId: string, userId: string): Promise<MemberRow | null> {
    const result = await q.query<MemberRow>(
      `SELECT id, group_id, user_id, role, joined_at
         FROM group_members
        WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId],
    );
    return result.rows[0] ?? null;
  }

  async listActive(q: Queryable, groupId: string): Promise<MemberRow[]> {
    const result = await q.query<MemberRow>(
      `SELECT id, group_id, user_id, role, joined_at
         FROM group_members
        WHERE group_id = $1 AND left_at IS NULL
        ORDER BY (role = 'titular') DESC, joined_at, id`,
      [groupId],
    );
    return result.rows;
  }

  /** Miembros activos con el nombre y el celular de su cuenta (titular primero). */
  async listActiveDetailed(q: Queryable, groupId: string): Promise<MemberDetailRow[]> {
    const result = await q.query<MemberDetailRow>(
      `SELECT m.id, m.group_id, m.user_id, m.role, m.joined_at, u.full_name, u.phone_e164
         FROM group_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1 AND m.left_at IS NULL
        ORDER BY (m.role = 'titular') DESC, m.joined_at, m.id`,
      [groupId],
    );
    return result.rows;
  }

  async countActive(q: Queryable, groupId: string): Promise<number> {
    const result = await q.query<{ count: string }>(
      'SELECT count(*) AS count FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [groupId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Marca la salida; devuelve false si no había fila activa. */
  async markLeft(
    q: Queryable,
    groupId: string,
    userId: string,
    reason: MemberRemovedReason,
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE group_members SET left_at = now(), left_reason = $3
        WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId, reason],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateRole(q: Queryable, groupId: string, userId: string, role: MemberRole): Promise<void> {
    await q.query(
      `UPDATE group_members SET role = $3
        WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId, role],
    );
  }
}
