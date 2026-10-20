import type { DomainEvent } from './domain-event.js';

// Eventos internos de las solicitudes de ingreso (spec 010, contracts/api.md). Los consume la
// spec 005 (avisos) y otras; ninguno lleva texto de mensajes, referencias ni nombres de archivo.
interface RequestEventBase extends DomainEvent {
  readonly requestId: string;
  readonly groupId: string;
  readonly applicantId: string;
  readonly hostId: string;
}

export interface JoinRequestOpened extends RequestEventBase {
  readonly type: 'join-requests.opened';
  readonly source: 'codigo' | 'publicacion';
  readonly listingId: string | null;
}

export interface PaymentDataSent extends RequestEventBase {
  readonly type: 'join-requests.payment-data-sent';
  readonly amountCents: number;
  readonly payDeadlineAt: Date;
}

export interface ProofSubmitted extends RequestEventBase {
  readonly type: 'join-requests.proof-submitted';
  readonly decisionDeadlineAt: Date;
}

export interface DecisionReminderDue extends RequestEventBase {
  readonly type: 'join-requests.decision-reminder-due';
  readonly decisionDeadlineAt: Date;
}

export interface JoinRequestAccepted extends RequestEventBase {
  readonly type: 'join-requests.accepted';
  readonly chargeId: string;
  readonly method: 'comprobante' | 'efectivo';
  /** Publicación de origen (spec 008); null si vino de un código. */
  readonly listingId: string | null;
}

export interface JoinRequestRejected extends RequestEventBase {
  readonly type: 'join-requests.rejected';
  readonly reason: string;
  readonly byHost: boolean;
  readonly rejectedAsFalse: boolean;
}

export interface JoinRequestCancelled extends RequestEventBase {
  readonly type: 'join-requests.cancelled';
  readonly reason: string;
  readonly bySystem: boolean;
}

export interface JoinRequestExpired extends RequestEventBase {
  readonly type: 'join-requests.expired';
  readonly reason: string;
}

export interface ChatMessageSent extends RequestEventBase {
  readonly type: 'join-requests.chat-message-sent';
  readonly messageId: string;
  readonly senderId: string;
  readonly recipientId: string;
}

interface DisputeEventBase extends RequestEventBase {
  readonly disputeId: string;
  readonly kind: 'pago_sin_ingreso' | 'comprobante_falso';
}

export interface DisputeOpened extends DisputeEventBase {
  readonly type: 'join-requests.dispute-opened';
  readonly openedBy: string;
  readonly accusedId: string;
}

export interface DisputeResponded extends DisputeEventBase {
  readonly type: 'join-requests.dispute-responded';
  readonly respondedBy: string;
}

export interface DisputeResolved extends DisputeEventBase {
  readonly type: 'join-requests.dispute-resolved';
  readonly result: 'estafa_confirmada' | 'sin_falta';
}
