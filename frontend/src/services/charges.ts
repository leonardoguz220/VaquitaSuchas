/**
 * Cliente de cobros y pagos (`specs/002-cobros-y-pagos/contracts/api.md`). Reúne los tipos de
 * toda la spec 002 para que los reutilicen T022 (subida), T026 (confirmar y rechazar) y T037
 * (historial y resumen del grupo). `listMyCharges`, `getCharge`, `uploadReceipt` y
 * `getReceiptFile` llaman al backend (T019 y T023); el resto responde con datos simulados de
 * `charges.mock.ts` hasta que su endpoint exista.
 */
import * as mock from './charges.mock';
import { apiRequest } from './http';
import type { GroupCurrency, PaymentInfo } from './groups';

export type ChargeStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';
export type ChargeOrigin = 'ciclo' | 'ingreso';
export type ChargeSettlement = 'comprobante' | 'manual' | 'ingreso';
export type ChargeAction = 'uploadReceipt' | 'confirm' | 'reject' | 'manualPayment' | 'cancel';
export type ReceiptMethod = 'qr' | 'transferencia';
export type ReceiptStatus = 'vigente' | 'reemplazado' | 'rechazado' | 'confirmado';

/** Tipos de `charge_events` (data-model 002, `0044_charge_events.sql`). */
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

export interface ChargeMember extends PersonRef {
  isFormerMember: boolean;
}

/** Evento de la versión pública: sin motivos ni notas. `actor: null` = sistema. */
export interface ChargePublicEvent {
  type: ChargeEventType;
  actor: PersonRef | null;
  occurredAt: string;
}

export interface ChargeEvent extends ChargePublicEvent {
  id: string;
  fromStatus: ChargeStatus | null;
  toStatus: ChargeStatus | null;
  reason: string | null;
  metadata?: Record<string, unknown>;
}

export interface Receipt {
  id: string;
  uploadedAt: string;
  uploadedBy: PersonRef;
  method: ReceiptMethod;
  reference: string;
  mime: string;
  sizeBytes: number;
  status: ReceiptStatus;
  fileAvailable: boolean;
}

export interface LastRejection {
  reason: string;
  invalidReceipt: boolean;
  at: string;
}

/** Lo que ve cualquier miembro del grupo (RF-002-16/17). */
export interface ChargePublic {
  id: string;
  groupId: string;
  /** `YYYY-MM`. */
  period: string;
  origin: ChargeOrigin;
  member: ChargeMember;
  amountCents: number;
  status: ChargeStatus;
  dueAt: string;
  paidAt: string | null;
  timeline: ChargePublicEvent[];
}

/** Lo que ven el dueño del cobro y el titular. */
export interface Charge extends ChargePublic {
  cycleId: string;
  issuedAt: string;
  firstSubmittedAt: string | null;
  priceCents: number;
  currency: GroupCurrency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  settlement: ChargeSettlement | null;
  settledBy: PersonRef | null;
  manualNote: string | null;
  cancelReason: string | null;
  lastRejection: LastRejection | null;
  currentReceipt: Receipt | null;
  receipts: Receipt[];
  timeline: ChargeEvent[];
  /** Solo mientras el cobro admite pago (RF-002-09). */
  paymentInfo: PaymentInfo | null;
  allowedActions: ChargeAction[];
  version: number;
}

export interface ChargeGroupRef {
  id: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
}

/** Ítem de `GET /me/charges`: sin `receipts` completos y con el grupo. */
export interface MyCharge extends Omit<Charge, 'receipts'> {
  group: ChargeGroupRef;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ListMyChargesParams {
  status?: ChargeStatus[];
  /** `YYYY-MM`. */
  period?: string;
  groupId?: string;
  limit?: number;
  cursor?: string;
}

export interface UploadReceiptInput {
  /** JPG, PNG o PDF de hasta 5 MB (el backend valida el tipo real). */
  file: File;
  method: ReceiptMethod;
  /** 1 a 100 caracteres. */
  reference: string;
  version?: number;
}

export interface ReceiptFile {
  url: string;
  expiresAt: string;
  mime: string;
}

export interface ConfirmChargeInput {
  version?: number;
}

export interface RejectChargeInput {
  /** 5 a 200 caracteres. */
  reason: string;
  invalidReceipt: boolean;
  version?: number;
}

export interface GroupChargesParams {
  period?: string;
  status?: ChargeStatus[];
  userId?: string;
  limit?: number;
  cursor?: string;
}

export interface PeriodSummary {
  period: string;
  cycleType: 'inicial' | 'regular';
  /** `YYYY-MM-DD` de La Paz. */
  cutDate: string;
  dueAt: string;
  totalBsCents: number;
  memberCount: number;
  baseShareCents: number;
  ownerShareCents: number;
  rows: { charge: ChargePublic; isFormerMember: boolean }[];
  /** Solo si consulta el titular (RF-002-18). */
  ownerTotals?: {
    expectedCents: number;
    collectedCents: number;
    pendingCents: number;
    overdueCents: number;
  };
}

export interface BillingSummary extends PeriodSummary {
  availablePeriods: string[];
}

export interface ChargesRequestOptions {
  signal?: AbortSignal;
}

/** Códigos de error propios de la spec 002 (además de los comunes del contrato 000 A.2). */
export type ChargesErrorCode =
  | 'REFERENCE_ALREADY_USED'
  | 'FILE_DELETED'
  | 'GROUP_FROZEN'
  | 'INVALID_TRANSITION'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'STALE_STATE'
  | 'SERVICE_UNAVAILABLE';

/**
 * Query de `GET /me/charges`: `status` se repite por cada estado (`?status=a&status=b`) y los
 * demás filtros solo van si vienen. Sin parámetros no hay `?`.
 */
export function buildListMyChargesQuery(params: ListMyChargesParams): string {
  const query = new URLSearchParams();
  params.status?.forEach((status) => query.append('status', status));
  if (params.period) query.set('period', params.period);
  if (params.groupId) query.set('groupId', params.groupId);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** `GET /me/charges` (RF-002-15): incluye cobros de grupos dejados si están `atrasado` o `en_revision`. */
export function listMyCharges(
  params: ListMyChargesParams = {},
  options: ChargesRequestOptions = {},
): Promise<Page<MyCharge>> {
  return apiRequest<Page<MyCharge>>(`/api/me/charges${buildListMyChargesQuery(params)}`, {
    signal: options.signal,
  });
}

/** `GET /charges/:chargeId`: `403` a otro miembro del grupo, `404` a quien no pertenece. */
export function getCharge(chargeId: string, options: ChargesRequestOptions = {}): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}`, {
    signal: options.signal,
  });
}

/**
 * Arma el `multipart/form-data` del comprobante: `file`, `method`, `reference` y `version` (solo
 * si viene). Campos y nombres según `receipts.controller.ts`.
 */
export function buildReceiptFormData(input: UploadReceiptInput): FormData {
  const form = new FormData();
  form.append('file', input.file);
  form.append('method', input.method);
  form.append('reference', input.reference);
  if (input.version !== undefined) form.append('version', String(input.version));
  return form;
}

/** `POST /charges/:chargeId/receipts` (RF-002-06 a 08), `multipart/form-data`. */
export function uploadReceipt(chargeId: string, input: UploadReceiptInput): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/receipts`, {
    method: 'POST',
    body: buildReceiptFormData(input),
  });
}

/** `GET /charges/:chargeId/receipts/:receiptId/file`: URL firmada; `410 FILE_DELETED`. */
export function getReceiptFile(
  chargeId: string,
  receiptId: string,
  options: ChargesRequestOptions = {},
): Promise<ReceiptFile> {
  return apiRequest<ReceiptFile>(
    `/api/charges/${encodeURIComponent(chargeId)}/receipts/${encodeURIComponent(receiptId)}/file`,
    { signal: options.signal },
  );
}

/** `POST /charges/:chargeId/confirm` (RF-002-10): solo el titular. `409 STALE_STATE` si cambió. */
export function confirmCharge(chargeId: string, input: ConfirmChargeInput = {}): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/confirm`, {
    method: 'POST',
    body: input,
  });
}

/** `POST /charges/:chargeId/reject` (RF-002-11): solo el titular, con motivo. */
export function rejectCharge(chargeId: string, input: RejectChargeInput): Promise<Charge> {
  return apiRequest<Charge>(`/api/charges/${encodeURIComponent(chargeId)}/reject`, {
    method: 'POST',
    body: input,
  });
}

/** `GET /groups/:groupId/charges` (RF-002-17): el titular recibe `Charge` completo. */
export function getGroupCharges(
  groupId: string,
  params: GroupChargesParams = {},
  options: ChargesRequestOptions = {},
): Promise<Page<ChargePublic | Charge>> {
  return mock.getGroupCharges(groupId, params, options.signal);
}

/** `GET /groups/:groupId/billing/summary` (RF-002-16, RF-002-18): `404` si no hay ciclo. */
export function getBillingSummary(
  groupId: string,
  period?: string,
  options: ChargesRequestOptions = {},
): Promise<BillingSummary> {
  return mock.getBillingSummary(groupId, period, options.signal);
}
