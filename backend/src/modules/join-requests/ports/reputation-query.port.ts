import type { Queryable } from '../../../shared/db/db.service.js';

export interface UserReputation {
  /** Promedio de estrellas; `null` = «Sin calificación». */
  stars: number | null;
  level: string | null;
}

/**
 * Calificación y nivel de varias personas (spec 007). El adaptador por defecto devuelve «Sin
 * calificación» (`stars` y `level` en `null`) para todas.
 */
export interface ReputationQueryPort {
  getMany(q: Queryable, userIds: readonly string[]): Promise<Map<string, UserReputation>>;
}

export const REPUTATION_QUERY_PORT = Symbol('REPUTATION_QUERY_PORT');
