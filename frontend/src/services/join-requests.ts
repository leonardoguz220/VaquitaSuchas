/**
 * Cliente de los endpoints de solicitudes de ingreso y chat (spec 010, `contracts/api.md`). Una
 * función por endpoint; los tipos salen del contrato congelado. El frontend no calcula cuotas,
 * plazos ni estados: usa `quote.amountCents`, `phase` y `allowedActions` del backend, y dibuja la
 * cuenta regresiva con `deadlineAt` y `serverNow`.
 */
import { apiRequest } from './http';

export type JoinRequestStatus =
  | 'abierta'
  | 'esperando_pago'
  | 'pago_informado'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'expirada';

/** Estados activos (RF-010-02): reservan o pueden reservar un cupo. */
export const ACTIVE_JOIN_STATUSES: JoinRequestStatus[] = [
  'abierta',
  'esperando_pago',
  'pago_informado',
];

/** Estados finales (RN-010-05). */
export const FINAL_JOIN_STATUSES: JoinRequestStatus[] = [
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
];

export type JoinRequestAction =
  | 'sendPaymentData'
  | 'extend'
  | 'uploadProof'
  | 'confirm'
  | 'cashPayment'
  | 'reject'
  | 'cancel'
  | 'sendMessage'
  | 'openDispute'
  | 'respondDispute';

export type DeadlineKind = 'solicitud' | 'pago' | 'decision';

/** El plazo vigente, evaluado con la hora del servidor al responder (RNF-010-03). */
export interface JoinRequestPhase {
  /** Estado efectivo: ya aplica los plazos vencidos aunque la tarea no haya corrido. */
  status: JoinRequestStatus;
  /** Vencimiento del plazo vigente (ISO 8601 en UTC). */
  deadlineAt: string | null;
  deadlineKind: DeadlineKind | null;
  /** Hora del servidor, para corregir la cuenta regresiva del cliente. */
  serverNow: string;
}

export interface JoinRequestGroup {
  id: string;
  name: string;
  serviceName: string;
  planName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  billingDay: number;
}

/** Persona con su calificación (spec 007); `stars: null` es «Sin calificación». */
export interface JoinRequestPerson {
  userId: string;
  fullName: string;
  stars: number | null;
  level: string | null;
}

export type JoinCurrency = 'USD' | 'BS';

/** Cotización fijada al enviar los datos de pago (RN-010-01). */
export interface JoinQuote {
  amountCents: number;
  priceCents: number;
  currency: JoinCurrency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
}

/** Datos de pago copiados a la solicitud; el QR se pide con `GET …/payment-qr`. */
export interface JoinPaymentInfo {
  text: string | null;
  qrAvailable: boolean;
}

export type JoinPaymentMethod = 'qr' | 'transferencia';

export interface JoinProof {
  method: JoinPaymentMethod;
  reference: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
  fileAvailable: boolean;
}

/** Ventana de ingreso del grupo (spec 001, RF-001-22). Fechas ISO 8601 en UTC. */
export interface JoinEntryWindow {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export type DisputeKind = 'pago_sin_ingreso' | 'comprobante_falso';
export type DisputeStatus = 'abierto' | 'resuelto';

export interface JoinDisputeRef {
  id: string;
  kind: DisputeKind;
  status: DisputeStatus;
  openedByMe: boolean;
  canRespond: boolean;
}

/** Tipos de evento de la línea de tiempo (`join_request_events.type`, data-model 010). */
export type JoinEventType =
  | 'abierta'
  | 'datos_pago_enviados'
  | 'plazo_prorrogado'
  | 'comprobante_subido'
  | 'confirmada'
  | 'efectivo_registrado'
  | 'rechazada'
  | 'cancelada'
  | 'expirada'
  | 'recordatorio_enviado'
  | 'reclamo_abierto'
  | 'reclamo_respondido'
  | 'reclamo_resuelto';

export interface JoinTimelineEvent {
  type: JoinEventType;
  /** `null` es el sistema. */
  actor: { userId: string; fullName: string } | null;
  fromStatus: JoinRequestStatus | null;
  toStatus: JoinRequestStatus | null;
  reason: string | null;
  occurredAt: string;
}

/** `JoinRequest` del contrato. */
export interface JoinRequest {
  id: string;
  group: JoinRequestGroup;
  applicant: JoinRequestPerson;
  host: JoinRequestPerson;
  source: 'codigo' | 'publicacion';
  phase: JoinRequestPhase;
  openedAt: string;
  /** Cuota estimada con los miembros actuales + 1 (RF-010-03); no es la cotización. */
  estimatedShareCents: number;
  quote: JoinQuote | null;
  paymentInfo: JoinPaymentInfo | null;
  extended: boolean;
  proof: JoinProof | null;
  entryWindow: JoinEntryWindow;
  /** Valores de `join_requests.final_reason` (data-model 010), por ejemplo `titular_sin_respuesta`. */
  finalReason: string | null;
  rejectReason: string | null;
  rejectedAsFalse: boolean;
  chargeId: string | null;
  unreadCount: number;
  disputes: JoinDisputeRef[];
  /** `null` si no corresponde o ya lo abrió. */
  canOpenDispute: { kind: DisputeKind; closesAt: string } | null;
  allowedActions: JoinRequestAction[];
  timeline: JoinTimelineEvent[];
  version: number;
}

export interface JoinRequestsPage {
  items: JoinRequest[];
  nextCursor: string | null;
}

export type JoinRequestRole = 'solicitante' | 'titular';

export interface ListJoinRequestsParams {
  role?: JoinRequestRole;
  /** Uno o varios estados. */
  status?: JoinRequestStatus[];
  groupId?: string;
  limit?: number;
  cursor?: string;
}

function listQuery(params: ListJoinRequestsParams): string {
  const query = new URLSearchParams();
  if (params.role) query.set('role', params.role);
  // [NECESITA ACLARACIÓN] el contrato dice «uno o varios» sin fijar el formato: se mandan
  // separados por coma (`status=abierta,esperando_pago`).
  if (params.status && params.status.length > 0) query.set('status', params.status.join(','));
  if (params.groupId) query.set('groupId', params.groupId);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return search ? `?${search}` : '';
}

/**
 * `POST /join-requests` (RF-010-01, RF-010-03): abre una solicitud `abierta` con el código; no une
 * a la persona al grupo. Lanza `ApiError` `422 INVALID_INVITE_CODE`, `429 RATE_LIMITED`, `422
 * BUSINESS_RULE` (`ENTRY_WINDOW_CLOSED` con `details.opensAt`, `GROUP_NOT_ACCEPTING`,
 * `NO_SLOTS_AVAILABLE`, `ACTIVE_REQUEST_EXISTS`, `TOO_MANY_ACTIVE_REQUESTS`,
 * `OPEN_CHARGES_IN_GROUP`, `ALREADY_MEMBER`, `GROUP_FROZEN`) o `403 ACCOUNT_RESTRICTED`.
 */
export function openJoinRequest(code: string): Promise<JoinRequest> {
  return apiRequest<JoinRequest>('/api/join-requests', { method: 'POST', body: { code } });
}

/**
 * `GET /join-requests` (RF-010-26): como solicitante, sus solicitudes (más recientes primero);
 * como titular, las de sus grupos (más antigua primero).
 */
export function listJoinRequests(params: ListJoinRequestsParams = {}): Promise<JoinRequestsPage> {
  return apiRequest<JoinRequestsPage>(`/api/join-requests${listQuery(params)}`);
}
