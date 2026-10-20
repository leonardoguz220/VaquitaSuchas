import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type IdentityKind = 'email' | 'phone' | 'ci' | 'telegram';

export interface BannedFingerprint {
  kind: IdentityKind;
  fingerprint: string;
}

/** SQL de `banned_identities` (0013_banned_identities.sql). */
@Injectable()
export class BannedIdentitiesRepository {
  async insertMany(q: Queryable, banRef: string, items: BannedFingerprint[]): Promise<void> {
    for (const item of items) {
      await q.query(
        `INSERT INTO banned_identities (kind, fingerprint, ban_ref)
         VALUES ($1, $2, $3)
         ON CONFLICT (kind, fingerprint) DO NOTHING`,
        [item.kind, item.fingerprint, banRef],
      );
    }
  }

  async deleteByBanRef(q: Queryable, banRef: string): Promise<void> {
    await q.query('DELETE FROM banned_identities WHERE ban_ref = $1', [banRef]);
  }

  async existsAny(q: Queryable, items: BannedFingerprint[]): Promise<boolean> {
    if (items.length === 0) return false;
    const result = await q.query(
      `SELECT 1 FROM banned_identities
        WHERE (kind, fingerprint) IN (SELECT * FROM unnest($1::text[], $2::text[]))
        LIMIT 1`,
      [items.map((i) => i.kind), items.map((i) => i.fingerprint)],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
