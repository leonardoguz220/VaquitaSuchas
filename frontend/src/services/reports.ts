/**
 * Cliente de los endpoints de panel y reportes (spec 006, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato. Todo trabaja sobre la persona con sesión. Los montos
 * son centavos de Bs calculados por el backend: el frontend no suma, no resta ni calcula
 * porcentajes (plan 006 §6).
 */
import { apiRequest } from './http';

export type ReportRole = 'miembro' | 'titular';

/** Línea del gasto del mes (RF-006-02). `paidCents` es `null` para el titular. */
export interface SpendLine {
  groupId: string;
  groupName: string;
  serviceName: string;
  logoUrl: string | null;
  role: ReportRole;
  costCents: number;
  paidCents: number | null;
}

/** Línea del ahorro estimado (RF-006-03). `savingsCents` puede ser negativo. */
export interface SavingsLine {
  groupId: string;
  serviceName: string;
  role: ReportRole;
  individualPriceBsCents: number;
  shareCents: number;
  savingsCents: number;
}

/** Miembro atrasado de la cobranza de un grupo. `dueDate` es `YYYY-MM-DD` de La Paz. */
export interface LateMember {
  userId: string;
  fullName: string;
  chargeId: string;
  amountCents: number;
  dueDate: string;
  daysLate: number;
}

/** Cobranza de un grupo del que la persona es titular (RF-006-06; CA-006-09). */
export interface CollectionSummary {
  groupId: string;
  groupName: string;
  serviceName: string;
  period: string;
  expectedCents: number;
  collectedCents: number;
  inReviewCents: number;
  pendingCents: number;
  /** Entero de 0 a 100 calculado por el backend; `null` si no hay nada esperado. */
  percentCollected: number | null;
  lateMembers: LateMember[];
}

export interface OwedGroup {
  groupId: string;
  groupName: string;
  serviceName: string;
  totalCents: number;
  count: number;
}

/** `DashboardSummary` del contrato (RF-006-01 a RF-006-06, RF-006-16). */
export interface DashboardSummary {
  /** `YYYY-MM`. */
  month: string;
  groupId: string | null;
  availableMonths: string[];
  isEmpty: boolean;
  hasGroups: boolean;
  spend: { totalCents: number; paidCents: number; lines: SpendLine[] };
  savings: {
    totalCents: number | null;
    estimated: true;
    lines: SavingsLine[];
    withoutData: Array<{ groupId: string; serviceName: string }>;
    negativeNote: string | null;
  };
  debts: { totalCents: number; count: number; inReviewCents: number; inReviewCount: number };
  owed: null | { totalCents: number; count: number; groups: OwedGroup[] };
  collection: CollectionSummary[];
}

export interface DashboardParams {
  /** `YYYY-MM`; sin él, el backend usa el mes actual de La Paz. */
  month?: string;
  groupId?: string;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * `GET /me/dashboard?month=&groupId=` (RF-006-01 a RF-006-06). Sin datos responde con ceros e
 * `isEmpty: true`, no con un error. `400` mes inválido, `404` `groupId` ajeno (CA-006-18).
 */
export function getDashboard(params: DashboardParams = {}): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>(
    `/api/me/dashboard${query({ month: params.month, groupId: params.groupId })}`,
  );
}

export type DashboardListName = 'debts' | 'in_review' | 'owed';

/** Cobro de las listas «Debo», «En revisión» y «Me deben». */
export interface ChargeLine {
  chargeId: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  period: string;
  /** Solo en «Me deben». */
  memberName: string | null;
  amountCents: number;
  status: 'pendiente' | 'atrasado' | 'en_revision';
  /** `YYYY-MM-DD` de La Paz. */
  dueDate: string;
  /** Ruta interna `/cobros/<id>`. */
  link: string;
}

export interface ChargeLinesPage {
  items: ChargeLine[];
  nextCursor: string | null;
}

export interface DashboardListParams {
  list: DashboardListName;
  groupId?: string;
  limit?: number;
  cursor?: string;
}

/**
 * `GET /me/dashboard/lists?list=&groupId=&limit=&cursor=` (RF-006-04, RF-006-05). `debts` es de
 * todos los períodos; `owed` responde `403` a quien no es titular de ningún grupo.
 */
export function listDashboard(params: DashboardListParams): Promise<ChargeLinesPage> {
  return apiRequest<ChargeLinesPage>(
    `/api/me/dashboard/lists${query({
      list: params.list,
      groupId: params.groupId,
      limit: params.limit,
      cursor: params.cursor,
    })}`,
  );
}
