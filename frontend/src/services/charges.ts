/**
 * Cliente de los endpoints de cobros y pagos (spec 002, `contracts/api.md`). Una función por
 * endpoint; los tipos salen del contrato congelado. El frontend no calcula montos, estados ni
 * vencimientos: muestra los campos `...Cents`, `status`, `dueAt` y `allowedActions` del backend.
 */
import { apiRequest } from './http';

export type ChargeStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';
export type ChargeOrigin = 'ciclo' | 'ingreso';
export type ChargeCurrency = 'USD' | 'BS';
export type ChargeSettlement = 'comprobante' | 'manual' | 'ingreso';
export type ChargeAction = 'uploadReceipt' | 'confirm' | 'reject' | 'manualPayment' | 'cancel';
export type PaymentMethod = 'qr' | 'transferencia';
export type ReceiptStatus = 'vigente' | 'reemplazado' | 'rechazado' | 'confirmado';

/** Tipos de evento de la línea de tiempo (`charge_events.type`, data-model 002). */
export type ChargeEventType =
  | 'generado'
  | 'ingreso_registrado'
  | 'comprobante_subido'
  | 'comprobante_reemplazado'
  | 'rechazado'
  | 'confirmado'
  | 'pago_manual'
  | 'atrasado'
  | 'cancelado'
  | 'retiro_por_mora';

export interface PersonRef {
  userId: string;
  fullName: string;
}

/** Evento público: sin motivos ni notas. `actor: null` es el sistema. */
export interface PublicChargeEvent {
  type: ChargeEventType;
  actor: PersonRef | null;
  /** ISO 8601 en UTC. */
  occurredAt: string;
}

/** Lo que ve cualquier miembro del grupo (RF-002-16, RF-002-17, RNF-002-07). */
export interface ChargePublic {
  id: string;
  groupId: string;
  /** `YYYY-MM`. */
  period: string;
  origin: ChargeOrigin;
  member: PersonRef & { isFormerMember: boolean };
  amountCents: number;
  status: ChargeStatus;
  /** Instante exclusivo en UTC: el cobro vence justo antes de este momento. */
  dueAt: string;
  paidAt: string | null;
  timeline: PublicChargeEvent[];
}

export interface Receipt {
  id: string;
  uploadedAt: string;
  uploadedBy: PersonRef;
  method: PaymentMethod;
  reference: string;
  mime: string;
  sizeBytes: number;
  status: ReceiptStatus;
  fileAvailable: boolean;
}

/** Evento completo, para el dueño del cobro y el titular. */
export interface ChargeEvent {
  id: string;
  type: ChargeEventType;
  actor: PersonRef | null;
  fromStatus: ChargeStatus | null;
  toStatus: ChargeStatus | null;
  reason: string | null;
  occurredAt: string;
}

/** Datos de pago del titular (RF-002-09). `qrUrl` es una URL firmada de corta duración. */
export interface ChargePaymentInfo {
  text: string | null;
  qrUrl: string | null;
  configured: boolean;
}

export interface ChargeRejection {
  reason: string;
  invalidReceipt: boolean;
  at: string;
}

/** Cobro completo: lo ven el dueño y el titular (`Charge` del contrato). */
export interface Charge extends Omit<ChargePublic, 'timeline'> {
  cycleId: string;
  issuedAt: string;
  firstSubmittedAt: string | null;
  priceCents: number;
  currency: ChargeCurrency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  settlement: ChargeSettlement | null;
  settledBy: PersonRef | null;
  manualNote: string | null;
  cancelReason: string | null;
  lastRejection: ChargeRejection | null;
  currentReceipt: Receipt | null;
  receipts: Receipt[];
  timeline: ChargeEvent[];
  /** Solo mientras el cobro admite pago. */
  paymentInfo: ChargePaymentInfo | null;
  /** Lo que puede hacer quien consulta, según su acceso y el estado (lo decide el backend). */
  allowedActions: ChargeAction[];
  version: number;
}

/** Grupo de cada ítem de `GET /me/charges`. */
export interface ChargeGroupRef {
  id: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
}

/** Ítem de "Mis cobros": un `Charge` con su grupo. */
export interface MyCharge extends Charge {
  group: ChargeGroupRef;
}

export interface MyChargesPage {
  items: MyCharge[];
  nextCursor: string | null;
}

export interface ListMyChargesParams {
  status?: ChargeStatus;
  /** `YYYY-MM`. */
  period?: string;
  groupId?: string;
  limit?: number;
  cursor?: string;
}

/**
 * `GET /me/charges` (RF-002-15): los cobros de la persona, ordenados por `dueAt` descendente.
 * Incluye los de grupos que dejó solo si están `atrasado` o `en_revision` (CA-002-32).
 */
export function listMyCharges(params: ListMyChargesParams = {}): Promise<MyChargesPage> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.period) query.set('period', params.period);
  if (params.groupId) query.set('groupId', params.groupId);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<MyChargesPage>(`/api/me/charges${search ? `?${search}` : ''}`);
}

/** `GET /charges/:chargeId`. Lanza `ApiError` `403` (otro miembro) o `404` (ajeno, CA-002-23). */
export function getCharge(chargeId: string): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}`);
}

export interface UploadReceiptRequest {
  /** JPG, PNG o PDF, máximo 5 MB (el servidor valida el tipo real). */
  file: File;
  method: PaymentMethod;
  /** 1 a 100 caracteres; obligatoria y única por grupo (RF-002-07). */
  reference: string;
  version?: number;
}

/**
 * `POST /charges/:chargeId/receipts` (RF-002-06, 07, 08) con `multipart/form-data`. Devuelve
 * el `Charge` en `en_revision`. Lanza `ApiError` `400 VALIDATION_ERROR`, `413 FILE_TOO_LARGE`,
 * `415 UNSUPPORTED_FILE_TYPE`, `409 INVALID_TRANSITION` / `REFERENCE_ALREADY_USED` /
 * `STALE_STATE`, `422 GROUP_FROZEN` y `503 SERVICE_UNAVAILABLE` (el cobro no cambió).
 */
export function uploadReceipt(chargeId: string, input: UploadReceiptRequest): Promise<Charge> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('method', input.method);
  form.append('reference', input.reference);
  if (input.version !== undefined) form.append('version', String(input.version));
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/receipts`, {
    method: 'POST',
    formData: form,
  });
}

/** Respuesta de `GET /charges/:id/receipts/:rid/file`: URL firmada de 10 minutos como máximo. */
export interface ReceiptFileLink {
  url: string;
  expiresAt: string;
  mime: string;
}

/**
 * `GET /charges/:chargeId/receipts/:receiptId/file` (RNF-002-01): solo el titular y el dueño del
 * cobro. Lanza `ApiError` `403` (CA-002-13), `404` (CA-002-23) o `410 FILE_DELETED` (RN-002-06).
 */
export function getReceiptFile(chargeId: string, receiptId: string): Promise<ReceiptFileLink> {
  return apiRequest<ReceiptFileLink>(
    `/api/charges/${encodeURIComponent(chargeId)}/receipts/${encodeURIComponent(receiptId)}/file`,
  );
}

/**
 * `POST /charges/:chargeId/confirm` (RF-002-10, CA-002-06), solo titular: deja el cobro en
 * `pagado`. Lanza `ApiError` `403` (CA-002-12), `409 INVALID_TRANSITION` o `STALE_STATE`.
 */
export function confirmCharge(chargeId: string, input: { version?: number } = {}): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/confirm`, {
    method: 'POST',
    body: input,
  });
}

export interface RejectChargeRequest {
  /** 5 a 200 caracteres (RF-002-11). */
  reason: string;
  /** «Comprobante inválido»: afecta la puntualidad (spec 007, RF-007-12). */
  invalidReceipt: boolean;
  version?: number;
}

/**
 * `POST /charges/:chargeId/reject` (RF-002-11, CA-002-07), solo titular: el cobro vuelve a
 * `pendiente` o pasa a `atrasado` según decida el backend. Lanza `ApiError` `400
 * VALIDATION_ERROR` (CA-002-08), `409 INVALID_TRANSITION` o `STALE_STATE`.
 */
export function rejectCharge(chargeId: string, input: RejectChargeRequest): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/reject`, {
    method: 'POST',
    body: input,
  });
}

/** Ítem del historial del grupo: `ChargePublic` para un miembro, `Charge` completo para el titular. */
export type GroupChargeItem = ChargePublic | Charge;

export interface GroupChargesPage {
  items: GroupChargeItem[];
  nextCursor: string | null;
}

export interface ListGroupChargesParams {
  period?: string;
  status?: ChargeStatus;
  userId?: string;
  limit?: number;
  cursor?: string;
}

/** Indica si el ítem trae el cobro completo (lo recibe el titular). */
export function isFullCharge(item: GroupChargeItem): item is Charge {
  return 'allowedActions' in item;
}

/**
 * `GET /groups/:groupId/charges` (RF-002-17, CA-002-18): historial del grupo, sin comprobantes
 * ni referencias para los miembros (RNF-002-07). `404` si la persona no es miembro activo.
 */
export function listGroupCharges(
  groupId: string,
  params: ListGroupChargesParams = {},
): Promise<GroupChargesPage> {
  const query = new URLSearchParams();
  if (params.period) query.set('period', params.period);
  if (params.status) query.set('status', params.status);
  if (params.userId) query.set('userId', params.userId);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<GroupChargesPage>(
    `/api/groups/${encodeURIComponent(groupId)}/charges${search ? `?${search}` : ''}`,
  );
}
