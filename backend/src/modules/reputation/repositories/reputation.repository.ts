import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ReputationLevel } from '../domain/level.js';
import type { Reputation } from '../domain/score.js';

export interface StoredReputation {
  userId: string;
  consideredCount: number;
  punctualCount: number;
  lateCount: number;
  halfStars: number | null;
  level: ReputationLevel;
  currentStreak: number;
  rulesVersion: number;
  computedAt: Date;
}

export interface ChargeLabel {
  groupName: string;
  serviceName: string;
  period: string;
}

export interface GroupMemberRow {
  userId: string;
  fullName: string;
  role: 'titular' | 'miembro';
  joinedAt: Date;
}

/** SQL de `user_reputation` (0060) y lecturas de apoyo de la reputación (spec 007). */
@Injectable()
export class ReputationRepository {
  async upsert(
    q: Queryable,
    userId: string,
    reputation: Reputation,
    rulesVersion: number,
    now: Date,
  ): Promise<void> {
    await q.query(
      `INSERT INTO user_reputation (user_id, considered_count, punctual_count, late_count,
                                    displayed_half_stars, level, current_streak, rules_version,
                                    computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         considered_count = EXCLUDED.considered_count,
         punctual_count = EXCLUDED.punctual_count,
         late_count = EXCLUDED.late_count,
         displayed_half_stars = EXCLUDED.displayed_half_stars,
         level = EXCLUDED.level,
         current_streak = EXCLUDED.current_streak,
         rules_version = EXCLUDED.rules_version,
         computed_at = EXCLUDED.computed_at`,
      [
        userId,
        reputation.consideredCount,
        reputation.punctualCount,
        reputation.lateCount,
        reputation.halfStars,
        reputation.level,
        reputation.currentStreak,
        rulesVersion,
        now,
      ],
    );
  }

  /** Lectura por lote; las personas sin fila no aparecen en el mapa. */
  async getMany(q: Queryable, userIds: readonly string[]): Promise<Map<string, StoredReputation>> {
    const map = new Map<string, StoredReputation>();
    if (userIds.length === 0) return map;
    const result = await q.query<{
      user_id: string;
      considered_count: number;
      punctual_count: number;
      late_count: number;
      displayed_half_stars: number | null;
      level: ReputationLevel;
      current_streak: number;
      rules_version: number;
      computed_at: Date;
    }>(
      `SELECT user_id, considered_count, punctual_count, late_count, displayed_half_stars, level,
              current_streak, rules_version, computed_at
         FROM user_reputation WHERE user_id = ANY($1::uuid[])`,
      [[...userIds]],
    );
    for (const row of result.rows) {
      map.set(row.user_id, {
        userId: row.user_id,
        consideredCount: row.considered_count,
        punctualCount: row.punctual_count,
        lateCount: row.late_count,
        halfStars: row.displayed_half_stars,
        level: row.level,
        currentStreak: row.current_streak,
        rulesVersion: row.rules_version,
        computedAt: row.computed_at,
      });
    }
    return map;
  }

  /** Cobros excluidos de la reputación (RF-007-14). */
  async excludedChargeIds(q: Queryable, chargeIds: readonly string[]): Promise<Set<string>> {
    if (chargeIds.length === 0) return new Set();
    const result = await q.query<{ charge_id: string }>(
      `SELECT charge_id FROM charge_reputation_exclusions WHERE charge_id = ANY($1::uuid[])`,
      [[...chargeIds]],
    );
    return new Set(result.rows.map((row) => row.charge_id));
  }

  async chargeLabels(
    q: Queryable,
    chargeIds: readonly string[],
  ): Promise<Map<string, ChargeLabel>> {
    const map = new Map<string, ChargeLabel>();
    if (chargeIds.length === 0) return map;
    const result = await q.query<{
      id: string;
      name: string;
      service_name_snapshot: string;
      period: string;
    }>(
      `SELECT c.id, g.name, g.service_name_snapshot, c.period
         FROM charges c JOIN groups g ON g.id = c.group_id
        WHERE c.id = ANY($1::uuid[])`,
      [[...chargeIds]],
    );
    for (const row of result.rows) {
      map.set(row.id, {
        groupName: row.name,
        serviceName: row.service_name_snapshot,
        period: row.period,
      });
    }
    return map;
  }

  /** Personas con cobros en el grupo (a quienes afecta que se congele). */
  async userIdsWithChargesInGroup(q: Queryable, groupId: string): Promise<string[]> {
    const result = await q.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM charges WHERE group_id = $1`,
      [groupId],
    );
    return result.rows.map((row) => row.user_id);
  }

  /** Habilitación manual vigente de un administrador (spec 009, RF-007-17). */
  async hasManualEnablement(q: Queryable, userId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM host_enablements WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return result.rows.length > 0;
  }

  /** ¿La persona es miembro activo del grupo? (ranking, `404` si no). */
  async isActiveMember(q: Queryable, groupId: string, userId: string): Promise<boolean> {
    const result = await q.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [groupId, userId],
    );
    return result.rows.length > 0;
  }

  /** Miembros activos del grupo, con su ingreso actual. */
  async activeMembers(q: Queryable, groupId: string): Promise<GroupMemberRow[]> {
    const result = await q.query<{
      user_id: string;
      full_name: string;
      role: 'titular' | 'miembro';
      joined_at: Date;
    }>(
      `SELECT m.user_id, u.full_name, m.role, m.joined_at
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1 AND m.left_at IS NULL
        ORDER BY m.joined_at, m.user_id`,
      [groupId],
    );
    return result.rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      role: r.role,
      joinedAt: r.joined_at,
    }));
  }

  /** Personas a conciliar: con cobros recientes, con calificación guardada o de otra versión de reglas. */
  async userIdsToReconcile(q: Queryable, since: Date, rulesVersion: number): Promise<string[]> {
    const result = await q.query<{ user_id: string }>(
      `SELECT user_id FROM charges WHERE due_at >= $1
       UNION SELECT user_id FROM user_reputation
              WHERE considered_count > 0 OR rules_version <> $2
       ORDER BY user_id`,
      [since, rulesVersion],
    );
    return result.rows.map((r) => r.user_id);
  }
}
