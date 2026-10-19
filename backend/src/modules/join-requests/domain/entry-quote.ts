/** Cuota de ingreso (RN-010-01): `floor(total / (miembros actuales + 1))`; el titular absorbe el resto. */
export function quoteEntryShare(totalBsCents: number, currentMembers: number): number {
  if (!Number.isSafeInteger(totalBsCents) || totalBsCents <= 0) {
    throw new Error('El total debe ser un entero positivo de centavos.');
  }
  if (!Number.isSafeInteger(currentMembers) || currentMembers < 1) {
    throw new Error('Debe haber al menos un miembro actual (el titular).');
  }
  return Math.floor(totalBsCents / (currentMembers + 1));
}
