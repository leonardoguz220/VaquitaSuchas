import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export interface ChargeScope {
  chargeId: string;
  userId: string;
  groupId: string;
  groupOwnerId: string;
}

/** SQL de `charge_reputation_exclusions` (0061) y `reputation_reports` (0062). */
@Injectable()
export class ExclusionsRepository {
  async findChargeScope(q: Queryable, chargeId: string): Promise<ChargeScope | null> {
    const result = await q.query<{
      id: string;
      user_id: string;
      group_id: string;
      owner_id: string;
    }>(
      `SELECT c.id, c.user_id, c.group_id, g.owner_id
         FROM charges c JOIN groups g ON g.id = c.group_id WHERE c.id = $1`,
      [chargeId],
    );
    const row = result.rows[0];
    return row
      ? { chargeId: row.id, userId: row.user_id, groupId: row.group_id, groupOwnerId: row.owner_id }
      : null;
  }

  async isActiveMember(q: Queryable, groupId: string, userId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId],
    );
    return result.rows.length > 0;
  }

  async isExcluded(q: Queryable, chargeId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM charge_reputation_exclusions WHERE charge_id = $1`,
      [chargeId],
    );
    return result.rows.length > 0;
  }

  async insertExclusion(
    q: Queryable,
    chargeId: string,
    reason: string,
    excludedBy: string,
  ): Promise<void> {
    await q.query(
      `INSERT INTO charge_reputation_exclusions (charge_id, reason, excluded_by) VALUES ($1, $2, $3)`,
      [chargeId, reason, excludedBy],
    );
  }

  async reportExists(q: Queryable, chargeId: string, reporterId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM reputation_reports WHERE charge_id = $1 AND reporter_id = $2`,
      [chargeId, reporterId],
    );
    return result.rows.length > 0;
  }

  async insertReport(
    q: Queryable,
    chargeId: string,
    reporterId: string,
    comment: string,
  ): Promise<void> {
    await q.query(
      `INSERT INTO reputation_reports (charge_id, reporter_id, comment) VALUES ($1, $2, $3)`,
      [chargeId, reporterId, comment],
    );
  }

  /** Cierra los reportes abiertos del cobro como atendidos por la exclusión. */
  async closeOpenReports(
    q: Queryable,
    chargeId: string,
    decidedBy: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await q.query(
      `UPDATE reputation_reports
          SET status = 'excluido', decided_by = $2, decided_at = $4, decision_reason = $3
        WHERE charge_id = $1 AND status = 'abierto'`,
      [chargeId, decidedBy, reason, now],
    );
  }
}
