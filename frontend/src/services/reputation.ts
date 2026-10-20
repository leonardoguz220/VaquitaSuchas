/**
 * Cliente de los endpoints de reputación (spec 007, `contracts/api.md`). Una función por endpoint y
 * tipos del contrato. El frontend muestra `stars`, `starsLabel`, `level`, `consideredCount`, etc.
 * tal como llegan: no calcula estrellas, niveles, racha ni habilitación, y nunca envía puntuaciones
 * ni fechas de pago. Los datos simulados de `reputation.mock.ts` solo los usan los tests.
 */
import { apiRequest } from './http';

/** Nivel de calificación (RF-007-02). `Nuevo` significa que aún no hay estrellas. */
export type RatingLevel = 'Nuevo' | 'En riesgo' | 'Regular' | 'Bueno' | 'Excelente';

/** Lo que ven otras personas autorizadas (RNF-007-04). */
export interface Rating {
  level: RatingLevel;
  /** 0 a 5 en pasos de 0,5; `null` = «Nuevo» (RF-007-02). */
  stars: number | null;
  /** «4,5 de 5» (RNF-007-06). */
  starsLabel: string | null;
}

export type RecentResult = 'puntual' | 'tardio';

export interface RecentCharge {
  chargeId: string;
  groupName: string;
  serviceName: string;
  /** Período de cobro (`YYYY-MM`). */
  period: string;
  result: RecentResult;
  /** Vencimiento en ISO 8601 (UTC). */
  dueAt: string;
  /** `false` para los cobros de ingreso (RN-007-09, CA-007-22). */
  countsForRating: boolean;
}

export type HostEligibilitySource = 'manual' | 'calificacion';

/** Habilitación como titular (RF-007-15 a 17). Los datos vienen calculados del servidor. */
export interface HostEligibilityStatus {
  eligible: boolean;
  source: HostEligibilitySource | null;
  minStars: number;
  minConsideredCharges: number;
  /** Lo que falta: `stars` y/o `charges`. */
  missing: string[];
}

export interface ReputationFormula {
  text: string;
  example: string;
  version: number;
}

/** Solo la propia persona (RF-007-04). */
export interface ReputationDetail extends Rating {
  consideredCount: number;
  punctualCount: number;
  lateCount: number;
  currentStreak: number;
  /** Valor exacto antes de redondear, como texto (para explicar el cálculo). */
  exactStars: string | null;
  recent: RecentCharge[];
  host: HostEligibilityStatus;
  formula: ReputationFormula;
}

/** Insignia ganada (RF-007-06 a 08, P2). */
export interface EarnedBadge {
  code: string;
  name: string;
  description: string;
  earnedAt: string;
}

/** Insignia pendiente con su avance (P2). */
export interface PendingBadge {
  code: string;
  name: string;
  description: string;
  condition: string;
  progress: { current: number; target: number };
}

export interface BadgesResponse {
  earned: EarnedBadge[];
  pending: PendingBadge[];
}

export interface RankingPerson {
  userId: string;
  fullName: string;
}

export interface RankingItem {
  position: number;
  user: RankingPerson;
  rating: Rating;
  streak: number;
}

export interface RankingUnranked {
  user: RankingPerson;
  rating: Rating;
}

/** Ranking del grupo (RF-007-09 a 11, P2). Nunca trae montos ni comprobantes. */
export interface GroupRanking {
  items: RankingItem[];
  unranked: RankingUnranked[];
}

/** Motivo de un reclamo de reputación (10 a 300 caracteres, P2). */
export interface ReportChargeReputationRequest {
  comment: string;
}

/** Motivo de la exclusión de un cobro por el titular (10 a 300 caracteres, P2). */
export interface ExcludeChargeReputationRequest {
  reason: string;
}

export interface ReputationRequestOptions {
  /** Permite cancelar la petición cuando la pantalla se desmonta. */
  signal?: AbortSignal;
}

/** `GET /users/me/reputation` (RF-007-01 a 05, RF-007-15; CA-007-01, 02, 16, 20). */
export function getMyReputation(options: ReputationRequestOptions = {}): Promise<ReputationDetail> {
  return apiRequest<ReputationDetail>('/api/users/me/reputation', { signal: options.signal });
}

/** `GET /users/me/badges` (RF-007-06 a 08; CA-007-08, 09; P2). */
export function getMyBadges(options: ReputationRequestOptions = {}): Promise<BadgesResponse> {
  return apiRequest<BadgesResponse>('/api/users/me/badges', { signal: options.signal });
}

/** `GET /groups/:groupId/ranking` (RF-007-09 a 11; CA-007-10, 11, 12; P2). */
export function getGroupRanking(
  groupId: string,
  options: ReputationRequestOptions = {},
): Promise<GroupRanking> {
  return apiRequest<GroupRanking>(`/api/groups/${encodeURIComponent(groupId)}/ranking`, {
    signal: options.signal,
  });
}

/** `POST /charges/:chargeId/reputation-report` (RF-007-14; P2). Responde 201. */
export function reportChargeReputation(
  chargeId: string,
  input: ReportChargeReputationRequest,
): Promise<void> {
  return apiRequest<void>(`/api/charges/${encodeURIComponent(chargeId)}/reputation-report`, {
    method: 'POST',
    body: input,
  });
}

/** `POST /charges/:chargeId/reputation-exclusion` (RF-007-14; CA-007-13; P2). Solo el titular. */
export function excludeChargeReputation(
  chargeId: string,
  input: ExcludeChargeReputationRequest,
): Promise<void> {
  return apiRequest<void>(`/api/charges/${encodeURIComponent(chargeId)}/reputation-exclusion`, {
    method: 'POST',
    body: input,
  });
}
