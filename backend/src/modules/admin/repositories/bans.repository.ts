import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type BanSource = 'admin' | 'reclamo';

export interface Ban {
  id: string;
  userId: string;
  reason: string;
  source: BanSource;
  disputeId: string | null;
  bannedBy: string;
  bannedAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

interface Row {
  id: string;
  user_id: string;
  reason: string;
  source: BanSource;
  dispute_id: string | null;
  banned_by: string;
  banned_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

const COLUMNS =
  'id, user_id, reason, source, dispute_id, banned_by, banned_at, revoked_at, revoked_by, revoke_reason';

const toBan = (row: Row): Ban => ({
  id: row.id,
  userId: row.user_id,
  reason: row.reason,
  source: row.source,
  disputeId: row.dispute_id,
  bannedBy: row.banned_by,
  bannedAt: row.banned_at,
  revokedAt: row.revoked_at,
  revokedBy: row.revoked_by,
  revokeReason: row.revoke_reason,
});

/** Tabla `bans` (0090). Un baneo no se borra: se revierte (RF-009-23). */
@Injectable()
export class BansRepository {
  async insert(
    q: Queryable,
    input: {
      userId: string;
      reason: string;
      source: BanSource;
      disputeId: string | null;
      bannedBy: string;
      bannedAt: Date;
    },
  ): Promise<Ban> {
    const result = await q.query<Row>(
      `INSERT INTO bans (user_id, reason, source, dispute_id, banned_by, banned_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [input.userId, input.reason, input.source, input.disputeId, input.bannedBy, input.bannedAt],
    );
    return toBan(result.rows[0]!);
  }

  async findById(q: Queryable, id: string, forUpdate = false): Promise<Ban | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM bans WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ? toBan(result.rows[0]) : null;
  }

  /** Baneo vigente de la persona (índice único `bans_active_user_uq`). */
  async findActiveByUser(q: Queryable, userId: string): Promise<Ban | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM bans WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return result.rows[0] ? toBan(result.rows[0]) : null;
  }

  /** Fija una sola vez las columnas `revoked_*`; `false` si ya estaba revertido. */
  async markRevoked(
    q: Queryable,
    input: { id: string; revokedBy: string; revokeReason: string; revokedAt: Date },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE bans SET revoked_at = $2, revoked_by = $3, revoke_reason = $4
       WHERE id = $1 AND revoked_at IS NULL`,
      [input.id, input.revokedAt, input.revokedBy, input.revokeReason],
    );
    return (result.rowCount ?? 0) === 1;
  }
}
