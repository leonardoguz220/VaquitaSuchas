import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface HostEnablement {
  id: string;
  userId: string;
  reason: string;
  enabledBy: string;
  enabledAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

interface Row {
  id: string;
  user_id: string;
  reason: string;
  enabled_by: string;
  enabled_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

const COLUMNS =
  'id, user_id, reason, enabled_by, enabled_at, revoked_at, revoked_by, revoke_reason';

const toEnablement = (row: Row): HostEnablement => ({
  id: row.id,
  userId: row.user_id,
  reason: row.reason,
  enabledBy: row.enabled_by,
  enabledAt: row.enabled_at,
  revokedAt: row.revoked_at,
  revokedBy: row.revoked_by,
  revokeReason: row.revoke_reason,
});

/** Tabla `host_enablements` (0091): habilitación manual para ser titular (RF-009-21). */
@Injectable()
export class HostEnablementsRepository {
  async insert(
    q: Queryable,
    input: { userId: string; reason: string; enabledBy: string; enabledAt: Date },
  ): Promise<HostEnablement> {
    const result = await q.query<Row>(
      `INSERT INTO host_enablements (user_id, reason, enabled_by, enabled_at)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.userId, input.reason, input.enabledBy, input.enabledAt],
    );
    return toEnablement(result.rows[0]!);
  }

  async findActiveByUser(q: Queryable, userId: string): Promise<HostEnablement | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM host_enablements WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return result.rows[0] ? toEnablement(result.rows[0]) : null;
  }

  /** Revoca la habilitación vigente; `false` si no había ninguna. */
  async revokeActive(
    q: Queryable,
    input: { userId: string; revokedBy: string; revokeReason: string; revokedAt: Date },
  ): Promise<boolean> {
    const result = await q.query(
      `UPDATE host_enablements SET revoked_at = $2, revoked_by = $3, revoke_reason = $4
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [input.userId, input.revokedAt, input.revokedBy, input.revokeReason],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /** Habilitaciones (por omisión solo las vigentes), las más recientes primero. */
  async list(
    q: Queryable,
    options: { activeOnly: boolean; limit: number },
  ): Promise<HostEnablement[]> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM host_enablements
       WHERE ($1::boolean = false OR revoked_at IS NULL)
       ORDER BY enabled_at DESC, id DESC LIMIT $2`,
      [options.activeOnly, options.limit],
    );
    return result.rows.map(toEnablement);
  }
}
