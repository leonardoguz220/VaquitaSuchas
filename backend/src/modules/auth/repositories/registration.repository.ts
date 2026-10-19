import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface NewUserRow {
  fullName: string;
  email: string;
  emailFingerprint: string;
  passwordHash: string;
  ciEncrypted: Buffer;
  ciFingerprint: string;
  policyVersion: string;
  now: Date;
  secretHash: string;
  secretExpiresAt: Date;
}

export interface ExistingUserRow {
  id: string;
  verified_at: Date | null;
}

/** SQL de `users` para registrar cuentas (0010_users.sql). */
@Injectable()
export class RegistrationRepository {
  async findByEmailForUpdate(q: Queryable, email: string): Promise<ExistingUserRow | null> {
    const result = await q.query<ExistingUserRow>(
      'SELECT id, verified_at FROM users WHERE email = $1 FOR UPDATE',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findIdByCiFingerprint(q: Queryable, fingerprint: string): Promise<string | null> {
    const result = await q.query<{ id: string }>('SELECT id FROM users WHERE ci_fingerprint = $1', [
      fingerprint,
    ]);
    return result.rows[0]?.id ?? null;
  }

  async insert(q: Queryable, row: NewUserRow): Promise<string> {
    const result = await q.query<{ id: string }>(
      `INSERT INTO users (full_name, email, email_fingerprint, password_hash, ci_encrypted,
                          ci_fingerprint, data_policy_accepted_at, data_policy_version,
                          registration_secret_hash, registration_secret_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        row.fullName,
        row.email,
        row.emailFingerprint,
        row.passwordHash,
        row.ciEncrypted,
        row.ciFingerprint,
        row.now,
        row.policyVersion,
        row.secretHash,
        row.secretExpiresAt,
      ],
    );
    return result.rows[0]!.id;
  }

  /** Cuenta sin verificar que se registra de nuevo: datos nuevos y secreto de sondeo nuevo. */
  async updateUnverified(q: Queryable, userId: string, row: NewUserRow): Promise<void> {
    await q.query(
      `UPDATE users
          SET full_name = $2, email_fingerprint = $3, password_hash = $4, ci_encrypted = $5,
              ci_fingerprint = $6, data_policy_accepted_at = $7, data_policy_version = $8,
              registration_secret_hash = $9, registration_secret_expires_at = $10,
              registration_secret_redeemed_at = NULL
        WHERE id = $1 AND verified_at IS NULL`,
      [
        userId,
        row.fullName,
        row.emailFingerprint,
        row.passwordHash,
        row.ciEncrypted,
        row.ciFingerprint,
        row.now,
        row.policyVersion,
        row.secretHash,
        row.secretExpiresAt,
      ],
    );
  }

  /** Cuenta del secreto de sondeo vigente (no vencido) para pedir un enlace nuevo. */
  async findBySecretHash(
    q: Queryable,
    secretHash: string,
    now: Date,
  ): Promise<{ id: string; email: string; verified_at: Date | null } | null> {
    const result = await q.query<{ id: string; email: string; verified_at: Date | null }>(
      `SELECT id, email, verified_at FROM users
        WHERE registration_secret_hash = $1 AND registration_secret_expires_at > $2
        FOR UPDATE`,
      [secretHash, now],
    );
    return result.rows[0] ?? null;
  }

  /** Marca al usuario como verificado con su celular y su cuenta de Telegram. */
  async markVerified(
    q: Queryable,
    userId: string,
    phone: string,
    telegramUserId: number,
    now: Date,
  ): Promise<void> {
    await q.query(
      `UPDATE users SET verified_at = $2, phone_e164 = $3, telegram_user_id = $4
        WHERE id = $1 AND verified_at IS NULL`,
      [userId, now, phone, telegramUserId],
    );
  }

  async phoneTaken(q: Queryable, phone: string, exceptUserId: string): Promise<boolean> {
    const result = await q.query('SELECT 1 FROM users WHERE phone_e164 = $1 AND id <> $2', [
      phone,
      exceptUserId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async telegramTaken(
    q: Queryable,
    telegramUserId: number,
    exceptUserId: string,
  ): Promise<boolean> {
    const result = await q.query('SELECT 1 FROM users WHERE telegram_user_id = $1 AND id <> $2', [
      telegramUserId,
      exceptUserId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }
}
