import type { RequestActionName } from '../domain/allowed-actions.js';
import type { RequestStatus } from '../domain/request-state.js';

// Objetos de respuesta de `contracts/api.md` (spec 010). Las fechas van en ISO 8601 UTC.
export interface JoinRequestPhaseView {
  status: RequestStatus;
  deadlineAt: string | null;
  deadlineKind: 'solicitud' | 'pago' | 'decision' | null;
  serverNow: string;
}

export interface PersonView {
  userId: string;
  fullName: string;
  stars: number | null;
  level: string | null;
}

export interface TimelineItemView {
  type: string;
  actor: { userId: string; fullName: string } | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface JoinRequestView {
  id: string;
  group: {
    id: string;
    name: string;
    serviceName: string;
    planName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    billingDay: number;
  };
  applicant: PersonView;
  host: PersonView;
  source: 'codigo' | 'publicacion';
  phase: JoinRequestPhaseView;
  openedAt: string;
  estimatedShareCents: number;
  quote: {
    amountCents: number;
    priceCents: number;
    currency: string;
    exchangeRate: string | null;
    totalBsCents: number;
    memberCount: number;
  } | null;
  paymentInfo: { text: string | null; qrAvailable: boolean } | null;
  extended: boolean;
  proof: {
    method: 'qr' | 'transferencia' | null;
    reference: string | null;
    mime: string | null;
    sizeBytes: number | null;
    uploadedAt: string | null;
    fileAvailable: boolean;
  } | null;
  entryWindow: { isOpen: boolean; opensAt: string | null; closesAt: string | null };
  finalReason: string | null;
  rejectReason: string | null;
  rejectedAsFalse: boolean;
  chargeId: string | null;
  unreadCount: number;
  disputes: {
    id: string;
    kind: 'pago_sin_ingreso' | 'comprobante_falso';
    status: 'abierto' | 'resuelto';
    openedByMe: boolean;
    canRespond: boolean;
  }[];
  canOpenDispute: { kind: 'pago_sin_ingreso' | 'comprobante_falso'; closesAt: string } | null;
  allowedActions: RequestActionName[];
  timeline: TimelineItemView[];
  version: number;
}

export interface JoinRequestsPage {
  items: JoinRequestView[];
  nextCursor: string | null;
}

export interface GroupJoinRequestsPage extends JoinRequestsPage {
  slots: { total: number; members: number; reserved: number; available: number };
}

export interface JoinRequestsSummary {
  unreadMessages: number;
  actionableAsHost: number;
  activeAsApplicant: number;
}
