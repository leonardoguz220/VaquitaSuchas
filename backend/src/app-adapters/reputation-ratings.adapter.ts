import { Injectable } from '@nestjs/common';
import type { Queryable } from '../shared/db/db.service.js';
import type {
  ReputationQueryPort,
  UserReputation,
} from '../modules/join-requests/ports/reputation-query.port.js';
import { ReputationQueryService } from '../modules/reputation/services/reputation-query.service.js';

/**
 * Adaptador de `ReputationQueryPort` de las solicitudes de ingreso y la ficha de administración
 * (specs 010 y 009) sobre la calificación real (spec 007): «Nuevo» no tiene estrellas.
 */
@Injectable()
export class ReputationRatingsAdapter implements ReputationQueryPort {
  constructor(private readonly ratings: ReputationQueryService) {}

  async getMany(q: Queryable, userIds: readonly string[]): Promise<Map<string, UserReputation>> {
    const ratings = await this.ratings.getRatings(q, userIds);
    return new Map(
      [...ratings].map(([userId, rating]) => [
        userId,
        { stars: rating.stars, level: rating.level },
      ]),
    );
  }
}
