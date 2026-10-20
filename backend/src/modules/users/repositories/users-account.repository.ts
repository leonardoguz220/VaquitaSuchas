import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';

export type UserStatus = 'activo' | 'suspendido' | 'baneado';
export type UserRole = 'usuario' | 'admin';

/** SQL de `users.status` y `users.role` (0010_users.sql). Solo lo usa UserAccountService. */
@Injectable()
export class UsersAccountRepository {
  /** Cambia el estado e incrementa `session_version`; devuelve la nueva versión o null si no existe. */
  async updateStatus(
    tx: DbTransaction,
    userId: string,
    status: UserStatus,
  ): Promise<number | null> {
    const result = await tx.query<{ session_version: number }>(
      `UPDATE users
          SET status = $2, session_version = session_version + 1, updated_at = now()
        WHERE id = $1
    RETURNING session_version`,
      [userId, status],
    );
    return result.rows[0]?.session_version ?? null;
  }

  async updateRole(tx: DbTransaction, userId: string, role: UserRole): Promise<number | null> {
    const result = await tx.query<{ session_version: number }>(
      `UPDATE users
          SET role = $2, session_version = session_version + 1, updated_at = now()
        WHERE id = $1
    RETURNING session_version`,
      [userId, role],
    );
    return result.rows[0]?.session_version ?? null;
  }
}
