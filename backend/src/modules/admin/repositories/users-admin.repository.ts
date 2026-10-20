import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { AccountRole, AccountStatus } from '../domain/admin-rules.js';
import type { AuditCursor } from '../domain/audit-cursor.js';

export interface AdminUserListRow {
  id: string;
  fullName: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface AdminUserDetailRow extends AdminUserListRow {
  phone: string | null;
  ciEncrypted: Buffer;
}

export interface UserListFilters {
  q?: string;
  status?: AccountStatus;
  role?: AccountRole;
}

interface Row {
  id: string;
  full_name: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  created_at: Date;
  last_login_at: Date | null;
  phone_e164?: string | null;
  ci_encrypted?: Buffer;
  created_at_us?: string;
}

const LIST_COLUMNS = `id, full_name, email, role, status, created_at, last_login_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_us`;

const toListRow = (row: Row): AdminUserListRow => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
});

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

/** SQL de lectura de `users` para administración; los cambios de estado y rol los hace `UserAccountService`. */
@Injectable()
export class UsersAdminRepository {
  /** Más recientes primero. Pide `limit + 1` filas para saber si hay otra página. */
  async list(
    q: Queryable,
    filters: UserListFilters,
    page: { limit: number; after: AuditCursor | null },
  ): Promise<{ items: AdminUserListRow[]; next: AuditCursor | null }> {
    const conditions: string[] = ['verified_at IS NOT NULL'];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replaceAll('?', `$${params.length}`));
    };
    const term = filters.q?.trim();
    if (term) {
      // Nombre sin tildes ni mayúsculas (índice users_name_search_idx) o correo con ILIKE.
      add(
        `(immutable_unaccent(lower(full_name)) LIKE '%' || immutable_unaccent(lower(?)) || '%' ESCAPE '\\'
          OR email ILIKE '%' || ? || '%' ESCAPE '\\')`,
        escapeLike(term),
      );
    }
    if (filters.status) add('status = ?', filters.status);
    if (filters.role) add('role = ?', filters.role);
    if (page.after) {
      params.push(page.after.occurredAt, page.after.id);
      conditions.push(
        `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(page.limit + 1);
    const result = await q.query<Row>(
      `SELECT ${LIST_COLUMNS} FROM users WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = result.rows.length > page.limit;
    const rows = hasMore ? result.rows.slice(0, page.limit) : result.rows;
    const last = rows[rows.length - 1];
    return {
      items: rows.map(toListRow),
      next: hasMore && last ? { occurredAt: last.created_at_us!, id: last.id } : null,
    };
  }

  async findDetail(
    q: Queryable,
    userId: string,
    forUpdate = false,
  ): Promise<AdminUserDetailRow | null> {
    const result = await q.query<Row>(
      `SELECT id, full_name, email, role, status, created_at, last_login_at, phone_e164, ci_encrypted
         FROM users WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? { ...toListRow(row), phone: row.phone_e164 ?? null, ciEncrypted: row.ci_encrypted! }
      : null;
  }

  /** Administradores activos ahora mismo (RN-009-01). */
  async countActiveAdmins(q: Queryable): Promise<number> {
    const result = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'activo'`,
    );
    return result.rows[0]?.n ?? 0;
  }
}
