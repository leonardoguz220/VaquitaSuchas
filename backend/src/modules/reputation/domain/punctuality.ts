import type { ChargeFact } from './facts.js';

/**
 * Instante que mide la puntualidad (RN-007-02, RF-007-12): en un pago manual, `paidAt`; con
 * comprobante, la primera subida o, si hubo un rechazo «comprobante inválido», la última.
 */
export function punctualityInstant(
  fact: Pick<
    ChargeFact,
    'settlement' | 'paidAt' | 'firstSubmittedAt' | 'lastUploadAt' | 'invalidReceipt'
  >,
): Date | null {
  if (fact.settlement === 'manual') return fact.paidAt;
  if (fact.invalidReceipt) return fact.lastUploadAt ?? fact.firstSubmittedAt;
  return fact.firstSubmittedAt;
}

/**
 * Puntual: `atrasado` nunca lo es (RN-007-04); `pagado` lo es si el instante cae antes del
 * vencimiento exclusivo, o sea hasta el último día a las 23:59:59 de La Paz (RN-007-06).
 */
export function isPunctual(fact: ChargeFact): boolean {
  if (fact.status !== 'pagado') return false;
  const instant = punctualityInstant(fact);
  return instant !== null && instant.getTime() < fact.dueAt.getTime();
}
