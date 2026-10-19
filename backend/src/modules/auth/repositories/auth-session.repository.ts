import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import type { UserRole } from '../../../shared/ports/auth-session.port.js';

/** SQL de lectura de la sesión sobre `users` (0010_users.sql). */
@Injectable()
export class AuthSessionRepository {
  constructor(private readonly db: DbService) {}

  /** Usuario activo, verificado y con la `session_version` dada; null si no cumple. */
  async findActiveByVersion(
    userId: string,
    sessionVersion: number,
  ): Promise<{ id: string; role: UserRole } | null> {
    const result = await this.db.query<{ id: string; role: UserRole }>(
      `SELECT id, role FROM users
        WHERE id = $1 AND status = 'activo' AND verified_at IS NOT NULL AND session_version = $2`,
      [userId, sessionVersion],
    );
    return result.rows[0] ?? null;
  }
}
