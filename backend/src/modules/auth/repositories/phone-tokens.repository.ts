import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { VerificationOutcome } from '../domain/phone-verification.js';

export type TokenPurpose = 'registro' | 'cambio_celular';

export interface PhoneTokenRow {
  id: string;
  purpose: TokenPurpose;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
  started_at: Date | null;
  started_by_telegram_id: string | null;
}

const COLUMNS = `id, purpose, user_id, expires_at, used_at, started_at, started_by_telegram_id::text`;

/** SQL de `phone_verification_tokens` (0011): solo se guarda el hash del token. */
@Injectable()
export class PhoneTokensRepository {
  /** Los enlaces anteriores de la cuenta dejan de servir (RF-003-21). */
  async invalidateOpen(
    q: Queryable,
    userId: string,
    now: Date,
    purpose: TokenPurpose = 'registro',
  ): Promise<void> {
    await q.query(
      `UPDATE phone_verification_tokens SET used_at = $2
        WHERE user_id = $1 AND purpose = $3 AND used_at IS NULL`,
      [userId, now, purpose],
    );
  }

  async insert(
    q: Queryable,
    row: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      ipHash: string;
      purpose?: TokenPurpose;
    },
  ): Promise<void> {
    await q.query(
      `INSERT INTO phone_verification_tokens (user_id, purpose, token_hash, expires_at, requested_ip_hash)
       VALUES ($1, $5, $2, $3, $4)`,
      [row.userId, row.tokenHash, row.expiresAt, row.ipHash, row.purpose ?? 'registro'],
    );
  }

  async findByHashForUpdate(q: Queryable, tokenHash: string): Promise<PhoneTokenRow | null> {
    const result = await q.query<PhoneTokenRow>(
      `SELECT ${COLUMNS} FROM phone_verification_tokens
        WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  /** Token abierto que esta cuenta de Telegram inició con «Iniciar». */
  async findOpenStartedBy(q: Queryable, telegramUserId: number): Promise<PhoneTokenRow | null> {
    const result = await q.query<PhoneTokenRow>(
      `SELECT ${COLUMNS} FROM phone_verification_tokens
        WHERE started_by_telegram_id = $1 AND used_at IS NULL AND started_at IS NOT NULL
        ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
      [telegramUserId],
    );
    return result.rows[0] ?? null;
  }

  async markStarted(q: Queryable, id: string, telegramUserId: number, now: Date): Promise<void> {
    await q.query(
      `UPDATE phone_verification_tokens SET started_at = $3, started_by_telegram_id = $2
        WHERE id = $1`,
      [id, telegramUserId, now],
    );
  }

  async markUsed(q: Queryable, id: string, outcome: VerificationOutcome, now: Date): Promise<void> {
    await q.query('UPDATE phone_verification_tokens SET used_at = $3, outcome = $2 WHERE id = $1', [
      id,
      outcome,
      now,
    ]);
  }

  /** Último token de registro de la cuenta (estado del sondeo). */
  async findLatestByUser(
    q: Queryable,
    userId: string,
    purpose: TokenPurpose = 'registro',
  ): Promise<{
    expires_at: Date;
    used_at: Date | null;
    outcome: VerificationOutcome | null;
    started_by_telegram_id: string | null;
  } | null> {
    const result = await q.query<{
      expires_at: Date;
      used_at: Date | null;
      outcome: VerificationOutcome | null;
      started_by_telegram_id: string | null;
    }>(
      `SELECT expires_at, used_at, outcome, started_by_telegram_id::text
         FROM phone_verification_tokens
        WHERE user_id = $1 AND purpose = $2
        ORDER BY created_at DESC LIMIT 1`,
      [userId, purpose],
    );
    return result.rows[0] ?? null;
  }
}
