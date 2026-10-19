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
