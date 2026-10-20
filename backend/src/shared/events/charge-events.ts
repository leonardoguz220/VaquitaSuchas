import type { DomainEvent } from './domain-event.js';

// Eventos de cobros publicados por billing (spec 002, plan §3) dentro de la transacción del
// hecho con `TxEventBus`; los consumen notificaciones (008), reputación (007) y solicitudes (010).
// Solo llevan identificadores y datos serializables, nunca montos de otras personas ni archivos.

export interface ChargeGenerated extends DomainEvent {
  readonly type: 'billing.charge-generated';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly period: string;
  readonly amountCents: number;
  readonly dueAt: Date;
}

export interface ChargeSubmitted extends DomainEvent {
  readonly type: 'billing.charge-submitted';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly receiptId: string;
  /** true si es un reemplazo de un comprobante vigente (RF-002-08). */
  readonly replaced: boolean;
}

export interface ChargeConfirmed extends DomainEvent {
  readonly type: 'billing.charge-confirmed';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly confirmedBy: string;
  readonly settlement: 'comprobante' | 'manual';
}

export interface ChargeRejected extends DomainEvent {
  readonly type: 'billing.charge-rejected';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly rejectedBy: string;
  readonly reason: string;
  readonly invalidReceipt: boolean;
  /** Estado al que vuelve el cobro: `pendiente` si está vigente, `atrasado` si ya venció. */
  readonly toStatus: 'pendiente' | 'atrasado';
}

export interface ChargeCancelled extends DomainEvent {
  readonly type: 'billing.charge-cancelled';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly cancelledBy: string;
  readonly reason: string;
}

export interface ChargeBecameOverdue extends DomainEvent {
  readonly type: 'billing.charge-became-overdue';
  readonly chargeId: string;
  readonly groupId: string;
  readonly userId: string;
}

export interface MemberRemovedForNonPayment extends DomainEvent {
  readonly type: 'billing.member-removed-for-non-payment';
  readonly groupId: string;
  readonly userId: string;
  readonly chargeId: string;
}
