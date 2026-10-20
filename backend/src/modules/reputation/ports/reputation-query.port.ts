import type { Queryable } from '../../../shared/db/db.service.js';
import type { ReputationLevel } from '../domain/level.js';

/** Lo que ven otras personas autorizadas (RNF-007-04). */
export interface Rating {
  level: ReputationLevel;
  /** 0–5 en pasos de 0,5; `null` = «Nuevo». */
  stars: number | null;
  starsLabel: string | null;
}

export interface HostRatingCheck {
  ok: boolean;
  stars: number | null;
  consideredCount: number;
  level: ReputationLevel;
  missing: string[];
}

/** Calificación para las specs 001, 008, 009 y 010 (ver `contracts/api.md`). */
export interface ReputationQueryPort {
  getRatings(q: Queryable, userIds: readonly string[]): Promise<Map<string, Rating>>;
  /** Calculado en el momento (RF-007-15, CA-007-20). */
  checkHostRating(q: Queryable, userId: string, now: Date): Promise<HostRatingCheck>;
}

export const REPUTATION_RATINGS_PORT = Symbol('REPUTATION_RATINGS_PORT');
