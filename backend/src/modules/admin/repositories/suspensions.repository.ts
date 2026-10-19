import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface Suspension {
  id: string;
  userId: string;
  reason: string;
  suspendedBy: string;
  suspendedAt: Date;
  reactivatedAt: Date | null;
  reactivatedBy: string | null;
}

interface Row {
  id: string;
  user_id: string;
  reason: string;
  suspended_by: string;
  suspended_at: Date;
  reactivated_at: Date | null;
  reactivated_by: string | null;
}

const COLUMNS = 'id, user_id, reason, suspended_by, suspended_at, reactivated_at, reactivated_by';

const toSuspension = (row: Row): Suspension => ({
  id: row.id,
  userId: row.user_id,
  reason: row.reason,
  suspendedBy: row.suspended_by,
  suspendedAt: row.suspended_at,
  reactivatedAt: row.reactivated_at,
  reactivatedBy: row.reactivated_by,
});

/** Tabla `user_suspensions` (0093): historial; el estado vigente está en `users.status`. */
@Injectable()
export class SuspensionsRepository {
  async insert(
    q: Queryable,
    input: { userId: string; reason: string; suspendedBy: string; suspendedAt: Date },
  ): Promise<Suspension> {
    const result = await q.query<Row>(
      `INSERT INTO user_suspensions (user_id, reason, suspended_by, suspended_at)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.userId, input.reason, input.suspendedBy, input.suspendedAt],
    );
    return toSuspension(result.rows[0]!);
  }

  async findOpenByUser(q: Queryable, userId: string): Promise<Suspension | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM user_suspensions WHERE user_id = $1 AND reactivated_at IS NULL`,
      [userId],
    );
    return result.rows[0] ? toSuspension(result.rows[0]) : null;
  }

  /** Cierra la suspensión abierta; `false` si no había ninguna. */
  async closeOpen(
    q: Queryable,
    input: { userId: string; reactivatedBy: string; reactivatedAt: Date },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE user_suspensions SET reactivated_at = $2, reactivated_by = $3
       WHERE user_id = $1 AND reactivated_at IS NULL`,
      [input.userId, input.reactivatedAt, input.reactivatedBy],
    );
    return (result.rowCount ?? 0) === 1;
  }
}
