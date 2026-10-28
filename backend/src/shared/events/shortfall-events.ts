import type { DomainEvent } from './domain-event.js';

// Eventos internos del faltante de grupo (spec 011, contracts/api.md). Los consume la spec 005
// (avisos). Ninguno lleva referencias de pago ni motivos escritos por las personas.
interface ShortfallEventBase extends DomainEvent {
  readonly roundId: string;
  readonly groupId: string;
  readonly hostId: string;
}

interface ShortfallRowEventBase extends ShortfallEventBase {
  readonly rowId: string;
  /** Miembro afectado. */
  readonly userId: string;
  /** Versión de la fila: distingue repeticiones legítimas del mismo aviso. */
  readonly rowVersion: number;
}

export interface ShortfallOpened extends ShortfallRowEventBase {
  readonly type: 'shortfalls.opened';
  readonly extraDueCents: number;
  readonly respondBy: Date;
}

export interface ShortfallPaymentInformed extends ShortfallRowEventBase {
  readonly type: 'shortfalls.payment-informed';
  readonly amountCents: number;
}

export interface ShortfallPaymentConfirmed extends ShortfallRowEventBase {
  readonly type: 'shortfalls.payment-confirmed';
}

export interface ShortfallPaymentRejected extends ShortfallRowEventBase {
  readonly type: 'shortfalls.payment-rejected';
  readonly payDeadlineAt: Date | null;
}

export interface ShortfallRefundOpened extends ShortfallRowEventBase {
  readonly type: 'shortfalls.refund-opened';
  readonly amountCents: number;
  readonly reason: 'devolucion' | 'sin_respuesta' | 'pago_vencido';
}

export interface ShortfallRefundSent extends ShortfallRowEventBase {
  readonly type: 'shortfalls.refund-sent';
  readonly amountCents: number;
}

export interface ShortfallRefundResolved extends ShortfallRowEventBase {
  readonly type: 'shortfalls.refund-resolved';
  readonly result: 'confirmada' | 'disputada';
}

export interface ShortfallClosed extends ShortfallEventBase {
  readonly type: 'shortfalls.closed';
  /** Miembros afectados de la ronda. */
  readonly userIds: readonly string[];
}
