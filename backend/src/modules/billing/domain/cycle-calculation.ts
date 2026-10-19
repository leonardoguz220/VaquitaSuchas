import { periodOf, type LaPazDate } from '../../subscriptions/domain/billing-calendar.js';
import { computeTotalBsCents, type Currency } from '../../subscriptions/domain/money.js';
import { splitShares } from '../../subscriptions/domain/shares.js';
import { transition, type ChargeStatus } from './charge-state.js';
import { dueAtFor } from './due-date.js';

export type CycleType = 'inicial' | 'regular';

/** Datos de la suscripción del grupo que se copian al emitir un ciclo (RN-002-02). */
export interface CycleGroupInput {
  ownerId: string;
  priceCents: number;
  currency: Currency;
  /** Bs por 1 USD como decimal (hasta 4 decimales); null si el precio está en Bs. */
  exchangeRate: string | null;
}

/** Ciclo listo para guardar: copia de precio, tipo de cambio y cuotas vigentes al corte. */
export interface Cycle {
  period: string;
  ownerId: string;
  cycleType: CycleType;
  cutDate: LaPazDate;
  /** Corte + 3 días en calendario de La Paz (RF-002-03); informativa. */
  dueDate: LaPazDate;
  issuedAt: Date;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  baseShareCents: number;
  ownerShareCents: number;
  remainderCents: number;
}

/** Cobro listo para guardar (origen `ciclo`), con la copia del ciclo. */
export interface ChargeDraft {
  userId: string;
  period: string;
  origin: 'ciclo';
  status: ChargeStatus;
  amountCents: number;
  priceCents: number;
  currency: Currency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
  issuedAt: Date;
  dueAt: Date;
}

/** Suma `days` a una fecha de calendario (los días fuera de rango se desbordan al mes siguiente). */
export function addDays(date: LaPazDate, days: number): LaPazDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Calcula el ciclo de un corte (RF-002-01, RF-002-02, RN-002-09): total en Bs con la regla de la
 * spec 001, cuota base = floor(total / miembros) y el resto al titular, de modo que
 * `base × (n − 1) + cuota del titular = total`. `memberCount` incluye al titular.
 */
export function buildCycle(
  group: CycleGroupInput,
  memberCount: number,
  cutDate: LaPazDate,
  now: Date,
  cycleType: CycleType = 'regular',
): Cycle {
  const totalBsCents = computeTotalBsCents(group.currency, group.priceCents, group.exchangeRate);
  const shares = splitShares(totalBsCents, memberCount);
  return {
    period: periodOf(cutDate),
    ownerId: group.ownerId,
    cycleType,
    cutDate,
    dueDate: addDays(cutDate, 3),
    issuedAt: now,
    priceCents: group.priceCents,
    currency: group.currency,
    exchangeRate: group.currency === 'USD' ? group.exchangeRate : null,
    totalBsCents,
    memberCount,
    baseShareCents: shares.baseShareCents,
    ownerShareCents: shares.ownerShareCents,
    remainderCents: shares.remainderCents,
  };
}

/**
 * Cobro de un miembro (no titular) a partir del ciclo: monto = cuota base y copia de precio,
 * moneda, tipo de cambio, total y miembros (RN-002-02). Nace `pendiente` por la función de
 * transición. Vence según `dueAtFor(corte, now)` (emisión tardía → 3 días completos).
 */
export function chargeFromCycle(cycle: Cycle, userId: string, now: Date): ChargeDraft {
  return {
    userId,
    period: cycle.period,
    origin: 'ciclo',
    status: transition(null, 'generate', { now, dueAt: now }),
    amountCents: cycle.baseShareCents,
    priceCents: cycle.priceCents,
    currency: cycle.currency,
    exchangeRate: cycle.exchangeRate,
    totalBsCents: cycle.totalBsCents,
    memberCount: cycle.memberCount,
    issuedAt: now,
    dueAt: dueAtFor(cycle.cutDate, now),
  };
}
