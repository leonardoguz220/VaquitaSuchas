export interface Shares {
  baseShareCents: number;
  ownerShareCents: number;
  remainderCents: number;
}

/** Reparto (RN-001-02): base = floor(total/n); el resto se suma a la cuota del titular. */
export function splitShares(totalBsCents: number, memberCount: number): Shares {
  if (!Number.isSafeInteger(totalBsCents) || totalBsCents < 0) {
    throw new Error('El total debe ser un entero no negativo de centavos.');
  }
  if (!Number.isSafeInteger(memberCount) || memberCount < 1) {
    throw new Error('Debe haber al menos un miembro.');
  }
  const baseShareCents = Math.floor(totalBsCents / memberCount);
  const remainderCents = totalBsCents - baseShareCents * memberCount;
  return { baseShareCents, ownerShareCents: baseShareCents + remainderCents, remainderCents };
}
