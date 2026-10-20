import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface EarnedBadgeRow {
  code: string;
  earnedAt: Date;
}

/** SQL de `user_badges` (0063): una insignia por persona y código, que se conserva (RF-007-08). */
@Injectable()
export class BadgesRepository {
  async listEarned(q: Queryable, userId: string): Promise<EarnedBadgeRow[]> {
    const result = await q.query<{ badge_code: string; earned_at: Date }>(
      `SELECT badge_code, earned_at FROM user_badges WHERE user_id = $1 ORDER BY earned_at, badge_code`,
      [userId],
    );
    return result.rows.map((r) => ({ code: r.badge_code, earnedAt: r.earned_at }));
  }

  /** Inserta las que faltan; repetir una es inofensivo (`ON CONFLICT DO NOTHING`). */
  async insertMany(
    q: Queryable,
    userId: string,
    codes: readonly string[],
    earnedAt: Date,
    rulesVersion: number,
  ): Promise<void> {
    for (const code of codes) {
      await q.query(
        `INSERT INTO user_badges (user_id, badge_code, earned_at, rules_version)
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, badge_code) DO NOTHING`,
        [userId, code, earnedAt, rulesVersion],
      );
    }
  }
}
