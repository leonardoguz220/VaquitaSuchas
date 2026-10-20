import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { meetsHostThreshold } from '../domain/host-threshold.js';
import { starsLabel } from '../domain/level.js';
import { isPunctual } from '../domain/punctuality.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { isConsidered } from '../domain/score.js';
import type {
  HostRatingCheck,
  Rating,
  ReputationQueryPort,
} from '../ports/reputation-query.port.js';
import { ReputationRepository } from '../repositories/reputation.repository.js';
import { ReputationService } from './reputation.service.js';

export const RECENT_LIMIT = 20;
export const FORMULA_VERSION_TEXT = {
  text: 'Tu calificación es 5 × cobros puntuales ÷ cobros considerados de los últimos 12 meses, redondeada a la media estrella más cercana.',
  example: 'Con 7 de 8 cobros puntuales: 5 × 7 ÷ 8 = 4,375, que se muestra como 4,5 de 5.',
};

export interface ReputationDetail extends Rating {
  consideredCount: number;
  punctualCount: number;
  lateCount: number;
  currentStreak: number;
  exactStars: string | null;
  recent: {
    chargeId: string;
    groupName: string;
    serviceName: string;
    period: string;
    result: 'puntual' | 'tardio';
    dueAt: string;
    countsForRating: boolean;
  }[];
  host: {
    eligible: boolean;
    source: 'manual' | 'calificacion' | null;
    minStars: 4.5;
    minConsideredCharges: 6;
    missing: string[];
  };
  formula: { text: string; example: string; version: number };
}

const NEW_RATING: Rating = { level: 'Nuevo', stars: null, starsLabel: null };

/** Lecturas de la calificación (spec 007): pública por lote, detalle propio y umbral de titular. */
@Injectable()
export class ReputationQueryService implements ReputationQueryPort {
  constructor(
    private readonly repository: ReputationRepository,
    private readonly reputation: ReputationService,
  ) {}

  /** Calificación guardada; sin fila es «Nuevo» (lectura por lote, sin consultar cobros). */
  async getRatings(q: Queryable, userIds: readonly string[]): Promise<Map<string, Rating>> {
    const stored = await this.repository.getMany(q, userIds);
    return new Map(
      userIds.map((id) => {
        const row = stored.get(id);
        if (!row || row.halfStars === null) return [id, NEW_RATING];
        return [
          id,
          { level: row.level, stars: row.halfStars / 2, starsLabel: starsLabel(row.halfStars) },
        ];
      }),
    );
  }

  async checkHostRating(q: Queryable, userId: string, now: Date): Promise<HostRatingCheck> {
    const rating = await this.reputation.computeNow(q, userId, now);
    const threshold = meetsHostThreshold(rating);
    return {
      ok: threshold.ok,
      stars: rating.halfStars === null ? null : rating.halfStars / 2,
      consideredCount: rating.consideredCount,
      level: rating.level,
      missing: threshold.missing,
    };
  }

  /** Detalle de la propia persona, calculado en el momento (RF-007-04). */
  async getDetail(q: Queryable, userId: string, now: Date): Promise<ReputationDetail> {
    const facts = await this.reputation.loadFacts(q, userId, now);
    const rating = await this.reputation.computeNow(q, userId, now);
    const recentFacts = facts
      .filter((f) => f.origin === 'ciclo' && (f.status === 'pagado' || f.status === 'atrasado'))
      .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime())
      .slice(0, RECENT_LIMIT);
    const labels = await this.repository.chargeLabels(
      q,
      recentFacts.map((f) => f.chargeId),
    );
    const threshold = meetsHostThreshold(rating);
    const manual = await this.repository.hasManualEnablement(q, userId);
    return {
      level: rating.level,
      stars: rating.halfStars === null ? null : rating.halfStars / 2,
      starsLabel: rating.halfStars === null ? null : starsLabel(rating.halfStars),
      consideredCount: rating.consideredCount,
      punctualCount: rating.punctualCount,
      lateCount: rating.lateCount,
      currentStreak: rating.currentStreak,
      exactStars: rating.exactStars,
      recent: recentFacts.map((f) => ({
        chargeId: f.chargeId,
        groupName: labels.get(f.chargeId)?.groupName ?? '',
        serviceName: labels.get(f.chargeId)?.serviceName ?? '',
        period: labels.get(f.chargeId)?.period ?? '',
        result: isPunctual(f) ? 'puntual' : 'tardio',
        dueAt: f.dueAt.toISOString(),
        countsForRating: isConsidered(f, now),
      })),
      host: {
        eligible: manual || threshold.ok,
        source: manual ? 'manual' : threshold.ok ? 'calificacion' : null,
        minStars: 4.5,
        minConsideredCharges: 6,
        missing: manual || threshold.ok ? [] : threshold.missing,
      },
      formula: { ...FORMULA_VERSION_TEXT, version: RULES_VERSION },
    };
  }
}
