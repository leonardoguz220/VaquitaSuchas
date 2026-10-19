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

/** Persona del ranking: solo id y nombre, sin montos ni comprobantes (CA-007-11). */
export interface RankingUser {
  userId: string;
  fullName: string;
}

export interface RankingItem {
  position: number;
  user: RankingUser;
  rating: Rating;
  streak: number;
}

/** Persona en nivel «Nuevo»: va al final y sin posición (RF-007-09). */
export interface UnrankedItem {
  user: RankingUser;
  rating: Rating;
  /** El contrato no la incluye en el ejemplo; se muestra solo si llega. */
  streak?: number;
}

export interface GroupRanking {
  items: RankingItem[];
  unranked: UnrankedItem[];
}

/**
 * `GET /groups/:groupId/ranking` (RF-007-09 a RF-007-11): el orden lo decide la API. Quien no
 * pertenece al grupo recibe `404` (CA-007-12).
 */
export function getGroupRanking(groupId: string): Promise<GroupRanking> {
  return apiRequest<GroupRanking>(`/api/groups/${encodeURIComponent(groupId)}/ranking`);
}

/** Largo del comentario del reporte y del motivo de la exclusión (contrato 007). */
export const REPUTATION_REASON_MIN = 10;
export const REPUTATION_REASON_MAX = 300;

/**
 * `POST /charges/:chargeId/reputation-report` (RF-007-14): el dueño del cobro lo reporta como mal
 * calificado. `201`. Errores: `422` `CHARGE_ALREADY_EXCLUDED` o `REPORT_ALREADY_SENT`.
 */
export function reportChargeRating(chargeId: string, input: { comment: string }): Promise<void> {
  return apiRequest<void>(`/api/charges/${encodeURIComponent(chargeId)}/reputation-report`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /charges/:chargeId/reputation-exclusion` (RF-007-14, CA-007-13): el titular excluye el
 * cobro con motivo; la calificación del dueño se recalcula en el servidor. `200`.
 */
export function excludeChargeFromReputation(
  chargeId: string,
  input: { reason: string },
): Promise<void> {
  return apiRequest<void>(`/api/charges/${encodeURIComponent(chargeId)}/reputation-exclusion`, {
    method: 'POST',
    body: input,
  });
}
