import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

/** SQL de `rate_limit_events` (0003): cuenta y registra intentos por cubo y huella. */
@Injectable()
export class RateLimitRepository {
  /** Eventos del cubo desde `since` y el más antiguo de ellos. */
  async countSince(
    q: Queryable,
    bucket: string,
    keyHash: string,
    since: Date,
  ): Promise<{ count: number; oldest: Date | null }> {
    const result = await q.query<{ count: string; oldest: Date | null }>(
      `SELECT count(*)::text AS count, min(occurred_at) AS oldest
         FROM rate_limit_events
        WHERE bucket = $1 AND key_hash = $2 AND occurred_at >= $3`,
      [bucket, keyHash, since],
    );
    const row = result.rows[0];
    return { count: Number(row?.count ?? 0), oldest: row?.oldest ?? null };
  }

  async record(q: Queryable, bucket: string, keyHash: string, at: Date): Promise<void> {
    await q.query(
      'INSERT INTO rate_limit_events (bucket, key_hash, occurred_at) VALUES ($1, $2, $3)',
      [bucket, keyHash, at],
    );
  }
}
