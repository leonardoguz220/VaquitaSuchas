/**
 * Cliente de los endpoints de panel y reportes (spec 006, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato. Todo trabaja sobre la persona con sesión. Los montos
 * son centavos de Bs calculados por el backend: el frontend no suma, no resta ni calcula
 * porcentajes (plan 006 §6).
 */
import * as mock from './reports.mock';

/** Archivo descargado de la API (CSV): contenido y nombre que propone el servidor. */
export interface ApiDownload {
  blob: Blob;
  filename: string | null;
}

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

/**
 * `GET /me/dashboard?month=&groupId=` (RF-006-01 a RF-006-06). Sin datos responde con ceros e
 * `isEmpty: true`, no con un error. `400` mes inválido, `404` `groupId` ajeno (CA-006-18).
 */
export function getDashboard(params: DashboardParams = {}): Promise<DashboardSummary> {
  return mock.getDashboard(params);
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
  return mock.listDashboard(params);
}

export type CollectionMemberStatus =
  'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

/** Fila por miembro de la cobranza del grupo. Sin comprobantes ni referencias (RNF-006-03). */
export interface CollectionMember {
  userId: string;
  fullName: string;
  chargeId: string;
  amountCents: number;
  status: CollectionMemberStatus;
}

export interface GroupCollection extends CollectionSummary {
  availablePeriods: string[];
  members: CollectionMember[];
}

/**
 * `GET /groups/:groupId/collection?period=` (RF-006-06; HU-006-04). Solo el titular: `403` a un
 * miembro y `404` si el grupo es ajeno.
 */
export function getGroupCollection(groupId: string, period?: string): Promise<GroupCollection> {
  return mock.getGroupCollection(groupId, period);
}

/** Series de los gráficos del panel (RF-006-07 a RF-006-10). Montos en centavos de Bs. */
export interface DashboardCharts {
  /** Hasta 12 meses, termina en el mes elegido, sin huecos. */
  monthly: Array<{ period: string; totalCents: number; paidCents: number }>;
  /** Gasto del mes elegido por servicio. */
  byService: Array<{ groupId: string; serviceName: string; costCents: number }>;
  /** `savingsCents: null` = sin dato. `cumulativeCents` puede ser negativo. */
  savings: Array<{ period: string; savingsCents: number | null; cumulativeCents: number }>;
}

/**
 * `GET /me/dashboard/charts?month=&groupId=` (RF-006-07 a RF-006-10; CA-006-11, CA-006-12).
 * Cada serie trae todos los valores para la tabla alternativa.
 */
export function getDashboardCharts(params: DashboardParams = {}): Promise<DashboardCharts> {
  return mock.getDashboardCharts(params);
}

/** Evento del calendario (RF-006-11, RF-006-12). `date` es `YYYY-MM-DD` de La Paz. */
export interface CalendarEvent {
  date: string;
  kind: 'corte' | 'vencimiento';
  groupId: string;
  groupName: string;
  serviceName: string;
  role: ReportRole;
  amountCents: number;
  /** `true` si el cobro o el ciclo todavía no existe y el monto es una estimación del backend. */
  estimated: boolean;
  chargeId: string | null;
  status: string | null;
}

export interface CalendarResponse {
  /** `YYYY-MM` del mes pedido. */
  month?: string;
  events: CalendarEvent[];
}

/** `GET /me/calendar?month=` (RF-006-11; CA-006-13): cortes y vencimientos del mes. */
export function getCalendar(month?: string): Promise<CalendarResponse> {
  return mock.getCalendar(month);
}

/** `GET /me/calendar/upcoming?days=` (RF-006-11): próximos días, de 1 a 90. */
export function getUpcomingEvents(days = 30): Promise<CalendarResponse> {
  return mock.getUpcomingEvents(days);
}

export type HistoryStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

/** Cobro propio del historial (RF-006-13): también `cancelado` y de grupos que dejó. */
export interface HistoryItem {
  chargeId: string;
  period: string;
  groupId: string;
  groupName: string;
  serviceName: string;
  amountCents: number;
  status: HistoryStatus;
  origin: 'ciclo' | 'ingreso';
  /** `YYYY-MM-DD` de La Paz. */
  dueDate: string;
  /** ISO 8601 en UTC. */
  paidAt: string | null;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export interface HistoryFilters {
  period?: string;
  groupId?: string;
  status?: HistoryStatus;
}

/** `GET /me/history?period=&groupId=&status=&limit=&cursor=` (RF-006-13), por período descendente. */
export function listHistory(
  params: HistoryFilters & { limit?: number; cursor?: string } = {},
): Promise<HistoryPage> {
  return mock.listHistory(params);
}

/**
 * `GET /me/history/export.csv?period=&groupId=&status=` (RF-006-14, RF-006-15). El nombre del
 * archivo lo da el servidor. `429 RATE_LIMITED` (10 por hora, `details.retryAfterSeconds`) y
 * `422 BUSINESS_RULE` (`EXPORT_TOO_LARGE`).
 */
export function exportHistoryCsv(filters: HistoryFilters = {}): Promise<ApiDownload> {
  return mock.exportHistoryCsv(filters);
}

export interface GroupExportFilters {
  period?: string;
  userId?: string;
  status?: HistoryStatus;
}

/**
 * `GET /groups/:groupId/history/export.csv?period=&userId=&status=` (RF-006-14; CA-006-17):
 * solo el titular (`403` a un miembro, `404` ajeno). Mismos errores que el historial propio.
 */
export function exportGroupHistoryCsv(
  groupId: string,
  filters: GroupExportFilters = {},
): Promise<ApiDownload> {
  return mock.exportGroupHistoryCsv(groupId, filters);
}
