import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { starsLabel } from '../domain/level.js';
import { rankingOrder } from '../domain/ranking-order.js';
import type { Rating } from '../ports/reputation-query.port.js';
import { ReputationRepository } from '../repositories/reputation.repository.js';

export interface RankingUser {
  userId: string;
  fullName: string;
}

export interface RankingResponse {
  items: { position: number; user: RankingUser; rating: Rating; streak: number }[];
  unranked: { user: RankingUser; rating: Rating }[];
}

/** Ranking de puntualidad del grupo (spec 007, US3): sin montos ni comprobantes (RF-007-10). */
@Injectable()
export class RankingService {
  constructor(
    private readonly db: DbService,
    private readonly repository: ReputationRepository,
  ) {}

  async ranking(userId: string, groupId: string): Promise<RankingResponse> {
    if (!(await this.repository.isActiveMember(this.db, groupId, userId))) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
    }
    const members = await this.repository.activeMembers(this.db, groupId);
    const stored = await this.repository.getMany(
      this.db,
      members.map((m) => m.userId),
    );
    const candidates = members
      // El titular aparece solo si tiene cobros como miembro en otros grupos (RF-007-11).
      .filter((m) => m.role !== 'titular' || (stored.get(m.userId)?.consideredCount ?? 0) > 0)
      .map((m) => {
        const row = stored.get(m.userId);
        return {
          member: m,
          userId: m.userId,
          halfStars: row?.halfStars ?? null,
          punctualCount: row?.punctualCount ?? 0,
          consideredCount: row?.consideredCount ?? 0,
          currentStreak: row?.currentStreak ?? 0,
          joinedAt: m.joinedAt,
          level: row?.level ?? ('Nuevo' as const),
        };
      });
    const { ranked, unranked } = rankingOrder(candidates);
    const ratingOf = (c: (typeof candidates)[number]): Rating =>
      c.halfStars === null
        ? { level: 'Nuevo', stars: null, starsLabel: null }
        : { level: c.level, stars: c.halfStars / 2, starsLabel: starsLabel(c.halfStars) };
    const userOf = (c: (typeof candidates)[number]): RankingUser => ({
      userId: c.userId,
      fullName: c.member.fullName,
    });
    return {
      items: ranked.map((c, i) => ({
        position: i + 1,
        user: userOf(c),
        rating: ratingOf(c),
        streak: c.currentStreak,
      })),
      unranked: unranked.map((c) => ({ user: userOf(c), rating: ratingOf(c) })),
    };
  }
}
