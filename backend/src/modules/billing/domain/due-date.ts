import {
  dueAtFor as baseDueAtFor,
  type LaPazDate,
} from '../../subscriptions/domain/billing-calendar.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Instante exclusivo de vencimiento de un cobro (RF-002-03, spec 001 research R2): el mayor entre
 * el inicio del día `corte + 4` en La Paz y `issuedAt + 3 días`. Si el cobro se emite a tiempo
 * manda el primero; si se emite tarde (caída del servidor, miembro nuevo) el segundo da siempre
 * 3 días completos de plazo.
 */
export function dueAtFor(cutDate: LaPazDate, issuedAt: Date): Date {
  const fromCut = baseDueAtFor(cutDate);
  const fromIssue = new Date(issuedAt.getTime() + THREE_DAYS_MS);
  return fromIssue.getTime() > fromCut.getTime() ? fromIssue : fromCut;
}

/** Un cobro vence en el instante exacto `dueAt` (RN-002-04): `now >= dueAt`. */
export function isOverdue(charge: { dueAt: Date }, now: Date): boolean {
  return now.getTime() >= charge.dueAt.getTime();
}
