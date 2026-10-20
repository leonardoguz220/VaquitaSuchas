import { splitShares } from '../../subscriptions/domain/shares.js';

/**
 * Cuota estimada por persona si se ocupan los cupos ofrecidos (RN-008-02): la cuota base de
 * `splitShares` (RN-001-02) con `miembros + cupos` personas. Siempre es una estimación.
 */
export function estimatedShare(totalBsCents: number, members: number, offered: number): number {
  return splitShares(totalBsCents, members + offered).baseShareCents;
}
