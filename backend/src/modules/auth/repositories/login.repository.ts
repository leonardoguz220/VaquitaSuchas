import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface LoginRow {
  id: string;
  password_hash: string;
  status: 'activo' | 'suspendido' | 'baneado';
  verified_at: Date | null;
  session_version: number;
}

/** SQL de `users` para iniciar y cerrar sesión (0010_users.sql). */
@Injectable()
export class LoginRepository {
  async findByEmail(q: Queryable, email: string): Promise<LoginRow | null> {
    const result = await q.query<LoginRow>(
      `SELECT id, password_hash, status, verified_at, session_version
         FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async touchLastLogin(q: Queryable, userId: string, now: Date): Promise<void> {
    await q.query('UPDATE users SET last_login_at = $2 WHERE id = $1', [userId, now]);
  }

  /** Invalida todos los tokens emitidos (RF-003-07). */
  async bumpSessionVersion(q: Queryable, userId: string): Promise<void> {
    await q.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [userId]);
  }
}
