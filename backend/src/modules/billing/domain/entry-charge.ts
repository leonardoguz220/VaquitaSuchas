import type { Currency } from '../../subscriptions/domain/money.js';
import { transition } from './charge-state.js';

/** Copia de la cuota cotizada en la solicitud de ingreso (spec 010, RF-002-19, RN-002-02). */
export interface EntrySnapshot {
  priceCents: number;
  currency: Currency;
  /** Bs por 1 USD como decimal; null si el precio está en Bs. */
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
}

export interface EntryChargeDraft extends EntrySnapshot {
  userId: string;
  period: string;
  origin: 'ingreso';
  status: 'pagado';
  settlement: 'ingreso';
  amountCents: number;
  issuedAt: Date;
  dueAt: Date;
  paidAt: Date;
}

/**
 * Cobro de ingreso (RF-002-19, RN-002-10): nace `pagado` por la función de transición, con la
 * copia cotizada. No vence (ya está pagado): `dueAt` = `issuedAt`. Nunca cuenta para la
 * puntualidad (spec 007, RN-007-09), que se decide por `origin`.
 */
export function entryChargeDraft(input: {
  userId: string;
  period: string;
  amountCents: number;
  snapshot: EntrySnapshot;
  now: Date;
}): EntryChargeDraft {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new RangeError('La cuota del cobro de ingreso debe ser un entero positivo de centavos.');
  }
  const status = transition(null, 'entryPaid', { now: input.now, dueAt: input.now });
  return {
    ...input.snapshot,
    userId: input.userId,
    period: input.period,
    origin: 'ingreso',
    status: status as 'pagado',
    settlement: 'ingreso',
    amountCents: input.amountCents,
    issuedAt: input.now,
    dueAt: input.now,
    paidAt: input.now,
  };
}
