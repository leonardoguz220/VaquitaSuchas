import type { AllowedAction } from '../domain/access.js';
import type { ChargeStatus } from '../domain/charge-state.js';

// Forma de las respuestas de cobros (contracts/api.md, objetos `Charge`, `Receipt` y `ChargeEvent`).
// Todas las fechas salen en ISO 8601 UTC y el dinero en centavos enteros.

export interface PersonRef {
  userId: string;
  fullName: string;
}

export interface ReceiptView {
  id: string;
  uploadedAt: string;
  uploadedBy: PersonRef;
  method: 'qr' | 'transferencia';
  reference: string;
  mime: string;
  sizeBytes: number;
  status: 'vigente' | 'reemplazado' | 'rechazado' | 'confirmado';
  fileAvailable: boolean;
}

export interface ChargeEventView {
  id: string;
  type: string;
  /** `null` = lo hizo el sistema. */
  actor: PersonRef | null;
  fromStatus: ChargeStatus | null;
  toStatus: ChargeStatus | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ChargeView {
  id: string;
  groupId: string;
  period: string;
  origin: 'ciclo' | 'ingreso';
  member: PersonRef & { isFormerMember: boolean };
  amountCents: number;
  status: ChargeStatus;
  dueAt: string;
  paidAt: string | null;
  cycleId: string;
  issuedAt: string;
  firstSubmittedAt: string | null;
  priceCents: number;
  currency: 'USD' | 'BS';
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  settlement: 'comprobante' | 'manual' | 'ingreso' | null;
  settledBy: PersonRef | null;
  manualNote: string | null;
  cancelReason: string | null;
  lastRejection: { reason: string; invalidReceipt: boolean; at: string } | null;
  currentReceipt: ReceiptView | null;
  receipts: ReceiptView[];
  timeline: ChargeEventView[];
  paymentInfo: { text: string | null; qrUrl: string | null; configured: boolean } | null;
  allowedActions: AllowedAction[];
  version: number;
}

/** Ítem de "Mis cobros": sin el historial completo de comprobantes y con el grupo (contrato). */
export type MyChargeView = Omit<ChargeView, 'receipts'> & {
  group: { id: string; name: string; serviceName: string; logoUrl: string | null };
};

export interface MyChargesPage {
  items: MyChargeView[];
  nextCursor: string | null;
}

/** Evento de la línea de tiempo pública: sin motivos, notas ni metadatos (RNF-002-07). */
export interface PublicEventView {
  type: string;
  /** `null` = lo hizo el sistema. */
  actor: PersonRef | null;
  occurredAt: string;
}

/** Lo que ve cualquier miembro del grupo de un cobro (contrato, `ChargePublic`). */
export interface ChargePublicView {
  id: string;
  groupId: string;
  period: string;
  origin: 'ciclo' | 'ingreso';
  member: PersonRef & { isFormerMember: boolean };
  amountCents: number;
  status: ChargeStatus;
  dueAt: string;
  paidAt: string | null;
  timeline: PublicEventView[];
}

export interface PeriodSummaryView {
  period: string;
  cycleType: 'inicial' | 'regular';
  cutDate: string;
  dueAt: string;
  totalBsCents: number;
  memberCount: number;
  baseShareCents: number;
  ownerShareCents: number;
  rows: { charge: ChargePublicView; isFormerMember: boolean }[];
  /** Solo si consulta el titular (RF-002-18). */
  ownerTotals?: {
    expectedCents: number;
    collectedCents: number;
    pendingCents: number;
    overdueCents: number;
  };
  availablePeriods: string[];
}

/** Historial del grupo: `Charge` completo para el titular y `ChargePublic` para los demás. */
export interface GroupChargesPage {
  items: (ChargePublicView | ChargeView)[];
  nextCursor: string | null;
}
