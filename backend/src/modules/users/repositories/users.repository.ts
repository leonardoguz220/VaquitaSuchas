import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface UserIdentityRow {
  email_fingerprint: string;
  ci_fingerprint: string;
  phone_e164: string | null;
  telegram_user_id: string | null;
}

/** SQL de lectura de `users` para identidad (0010_users.sql). */
@Injectable()
export class UsersRepository {
  async findIdentityById(q: Queryable, userId: string): Promise<UserIdentityRow | null> {
    const result = await q.query<UserIdentityRow>(
      `SELECT email_fingerprint, ci_fingerprint, phone_e164, telegram_user_id::text AS telegram_user_id
         FROM users WHERE id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }
}
