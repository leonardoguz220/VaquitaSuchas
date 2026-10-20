import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { BADGES, badgeProgress, badgesEarned } from '../domain/badges-rules.js';
import type { ChargeFact } from '../domain/facts.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { BadgesRepository } from '../repositories/badges.repository.js';

export interface BadgesView {
  earned: { code: string; name: string; description: string; earnedAt: string }[];
  pending: {
    code: string;
    name: string;
    description: string;
    condition: string;
    progress: { current: number; target: number };
  }[];
}

/** Insignias (spec 007, US2): se otorgan en cada recálculo y se conservan aunque se rompa la racha. */
@Injectable()
export class BadgesService {
  constructor(private readonly repository: BadgesRepository) {}

  /** Otorga las que se ganaron con estos hechos. Devuelve los códigos nuevos. */
  async grant(
    q: Queryable,
    userId: string,
    facts: readonly ChargeFact[],
    now: Date,
  ): Promise<string[]> {
    const existing = new Set((await this.repository.listEarned(q, userId)).map((b) => b.code));
    const fresh = badgesEarned(facts, existing, now);
    await this.repository.insertMany(q, userId, fresh, now, RULES_VERSION);
    return fresh;
  }

  /** Obtenidas con fecha y pendientes con su avance, calculado al consultar (RF-007-07). */
  async view(
    q: Queryable,
    userId: string,
    facts: readonly ChargeFact[],
    now: Date,
  ): Promise<BadgesView> {
    const earnedRows = await this.repository.listEarned(q, userId);
    const earnedCodes = new Set(earnedRows.map((b) => b.code));
    return {
      earned: earnedRows.flatMap((row) => {
        const definition = BADGES.find((b) => b.code === row.code);
        return definition
          ? [
              {
                code: row.code,
                name: definition.name,
                description: definition.description,
                earnedAt: row.earnedAt.toISOString(),
              },
            ]
          : [];
      }),
      pending: BADGES.filter((b) => !earnedCodes.has(b.code)).map((b) => ({
        code: b.code,
        name: b.name,
        description: b.description,
        condition: b.condition,
        progress: { current: badgeProgress(b.code, facts, now), target: b.target },
      })),
    };
  }
}
