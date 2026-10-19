import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface ResetTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
  email: string;
  status: 'activo' | 'suspendido' | 'baneado';
  verified_at: Date | null;
}

/** SQL de `password_reset_tokens` (0012): solo se guarda el hash del token. */
@Injectable()
export class ResetTokensRepository {
  /** Los enlaces anteriores de la cuenta dejan de servir (RF-003-13). */
  async invalidateOpen(q: Queryable, userId: string, now: Date): Promise<void> {
    await q.query(
      'UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL',
      [userId, now],
    );
  }

  async insert(
    q: Queryable,
    row: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    await q.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [row.userId, row.tokenHash, row.expiresAt],
    );
  }

  async findByHashForUpdate(q: Queryable, tokenHash: string): Promise<ResetTokenRow | null> {
    const result = await q.query<ResetTokenRow>(
      `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.email, u.status, u.verified_at
         FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
        FOR UPDATE OF t`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async markUsed(q: Queryable, id: string, now: Date): Promise<void> {
    await q.query('UPDATE password_reset_tokens SET used_at = $2 WHERE id = $1', [id, now]);
  }
}
