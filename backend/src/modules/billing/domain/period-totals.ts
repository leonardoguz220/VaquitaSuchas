import type { ChargeStatus } from './charge-state.js';

/** Totales del período que ve el titular (RF-002-18, CA-002-20), en centavos enteros. */
export interface OwnerTotals {
  expectedCents: number;
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
}

/**
 * `expected` = Σ cobros distintos de `cancelado`; `collected` = Σ `pagado`; `pending` = Σ
 * (`pendiente` + `en_revision`); `overdue` = Σ `atrasado`. Siempre `expected = collected + pending
 * + overdue`.
 */
export function ownerTotals(
  charges: readonly { status: ChargeStatus; amountCents: number }[],
): OwnerTotals {
  const totals: OwnerTotals = {
    expectedCents: 0,
    collectedCents: 0,
    pendingCents: 0,
    overdueCents: 0,
  };
  for (const { status, amountCents } of charges) {
    switch (status) {
      case 'cancelado':
        continue;
      case 'pagado':
        totals.collectedCents += amountCents;
        break;
      case 'atrasado':
        totals.overdueCents += amountCents;
        break;
      case 'pendiente':
      case 'en_revision':
        totals.pendingCents += amountCents;
        break;
    }
    totals.expectedCents += amountCents;
  }
  return totals;
}

/**
 * Un cobro por miembro en el resumen del mes: si la persona tiene uno vigente (no cancelado) se
 * muestra ese; si solo tiene cancelados, el más reciente. Conserva el orden de entrada.
 */
export function oneChargePerMember<T extends { userId: string; status: ChargeStatus }>(
  charges: readonly T[],
): T[] {
  const chosen = new Map<string, T>();
  for (const charge of charges) {
    const current = chosen.get(charge.userId);
    if (!current || current.status === 'cancelado') chosen.set(charge.userId, charge);
  }
  const order = new Map<string, number>();
  charges.forEach((charge, index) => {
    if (!order.has(charge.userId)) order.set(charge.userId, index);
  });
  return [...chosen.values()].sort(
    (a, b) => (order.get(a.userId) as number) - (order.get(b.userId) as number),
  );
}
