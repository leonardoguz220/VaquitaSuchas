/**
 * Cliente de los endpoints de reputación (spec 007, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato. La calificación, el nivel, la racha y la habilitación
 * como titular los calcula el backend (RNF-007-05): el cliente nunca envía fechas ni puntajes.
 */
import { apiRequest } from './http';

export type ReputationLevel = 'Nuevo' | 'En riesgo' | 'Regular' | 'Bueno' | 'Excelente';

/** Calificación que ven otras personas autorizadas (RNF-007-04). */
export interface Rating {
  level: ReputationLevel;
  /** De 0 a 5 en pasos de 0,5; `null` = «Nuevo» (RF-007-02). */
  stars: number | null;
  /** Por ejemplo `"4,5 de 5"` (RNF-007-06). */
  starsLabel?: string | null;
}

export type ChargeRatingResult = 'puntual' | 'tardio';

/** Cobro reciente del detalle de reputación (RF-007-04). */
export interface ReputationRecentCharge {
  chargeId: string;
  groupName: string;
  serviceName: string;
  /** Período `YYYY-MM`. */
  period: string;
  result: ChargeRatingResult;
  /** Instante exclusivo de vencimiento, ISO 8601 en UTC (spec 002). */
  dueAt: string;
  /** `false` si el cobro fue excluido de la reputación (RF-007-14). */
  countsForRating: boolean;
}

/** Habilitación para crear suscripciones (RF-007-15 a RF-007-17). */
export interface HostRatingStatus {
  eligible: boolean;
  source: 'manual' | 'calificacion' | null;
  minStars: number;
  minConsideredCharges: number;
  /** Lo que falta, tal como lo entrega la API. */
  missing: string[];
}

/** `ReputationDetail` del contrato: solo lo ve la propia persona (RF-007-04). */
export interface ReputationDetail extends Rating {
  consideredCount: number;
  punctualCount: number;
  lateCount: number;
  currentStreak: number;
  /** Valor exacto con punto decimal (`"4.3750"`), para explicar el cálculo; `null` si es «Nuevo». */
  exactStars: string | null;
  recent: ReputationRecentCharge[];
  host: HostRatingStatus;
  /** Explicación de la fórmula con un ejemplo (RNF-007-01). Texto plano. */
  formula: { text: string; example: string; version: number };
}

/** `GET /users/me/reputation` (RF-007-01 a RF-007-05, RF-007-15). */
export function getMyReputation(): Promise<ReputationDetail> {
  return apiRequest<ReputationDetail>('/api/users/me/reputation');
}

/** Insignia obtenida (RF-007-07). Se conserva aunque se rompa la racha (RF-007-08). */
export interface EarnedBadge {
  code: string;
  name: string;
  description: string;
  /** ISO 8601 en UTC. */
  earnedAt: string;
}

/** Insignia por obtener con el avance que calcula el backend (RF-007-07). */
export interface PendingBadge {
  code: string;
  name: string;
  description: string;
  condition: string;
  progress: { current: number; target: number };
}

export interface MyBadges {
  earned: EarnedBadge[];
  pending: PendingBadge[];
}

/** `GET /users/me/badges` (RF-007-06 a RF-007-08). */
export function getMyBadges(): Promise<MyBadges> {
  return apiRequest<MyBadges>('/api/users/me/badges');
}
