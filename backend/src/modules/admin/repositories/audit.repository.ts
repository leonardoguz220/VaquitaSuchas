import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { AdminAuditAction, AuditTargetType } from '../domain/audit-entry.js';
import { encodeAuditCursor, type AuditCursor } from '../domain/audit-cursor.js';

export interface AuditRecord {
  id: string;
  adminId: string;
  action: AdminAuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface NewAuditRecord {
  adminId: string;
  action: AdminAuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface AuditFilters {
  adminId?: string;
  action?: AdminAuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  from?: Date;
  to?: Date;
}

interface Row {
  id: string;
  admin_id: string;
  action: AdminAuditAction;
  target_type: AuditTargetType;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: Date;
  occurred_at_us: string;
}

const COLUMNS = `id, admin_id, action, target_type, target_id, reason, metadata, occurred_at,
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_us`;

const toRecord = (row: Row): AuditRecord => ({
  id: row.id,
  adminId: row.admin_id,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  reason: row.reason,
  metadata: row.metadata,
  occurredAt: row.occurred_at,
});

/**
 * `admin_audit_log` es de solo anexado (RNF-009-05): este repositorio no tiene actualizar ni
 * borrar, y la base lo impide con el disparador `admin_audit_log_append_only`.
 */
@Injectable()
export class AuditRepository {
  async insert(q: Queryable, entry: NewAuditRecord): Promise<string> {
    const result = await q.query<{ id: string }>(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id`,
      [
        entry.adminId,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.reason,
        JSON.stringify(entry.metadata),
        entry.occurredAt,
      ],
    );
    return result.rows[0]!.id;
  }

  /** Más recientes primero. Pide `limit + 1` filas para saber si hay otra página. */
  async list(
    q: Queryable,
    filters: AuditFilters,
    page: { limit: number; after: AuditCursor | null },
  ): Promise<{ items: AuditRecord[]; nextCursor: string | null }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (filters.adminId) add('admin_id = ?', filters.adminId);
    if (filters.action) add('action = ?', filters.action);
    if (filters.targetType) add('target_type = ?', filters.targetType);
    if (filters.targetId) add('target_id = ?', filters.targetId);
    if (filters.from) add('occurred_at >= ?', filters.from);
    if (filters.to) add('occurred_at <= ?', filters.to);
    if (page.after) {
      params.push(page.after.occurredAt, page.after.id);
      conditions.push(
        `(occurred_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(page.limit + 1);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM admin_audit_log ${where}
       ORDER BY occurred_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = result.rows.length > page.limit;
    const rows = hasMore ? result.rows.slice(0, page.limit) : result.rows;
    const last = rows[rows.length - 1];
    return {
      items: rows.map(toRecord),
      nextCursor:
        hasMore && last
          ? encodeAuditCursor({ occurredAt: last.occurred_at_us, id: last.id })
          : null,
    };
  }
}
