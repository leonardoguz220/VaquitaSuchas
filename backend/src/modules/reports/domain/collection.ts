/** Porcentaje cobrado como entero, mitad hacia arriba; `null` si lo esperado es 0 (CA-006-09). */
export function percentCollected(collectedCents: number, expectedCents: number): number | null {
  if (expectedCents <= 0) return null;
  // Aritmética entera: floor((200 * c + e) / (2 * e)) redondea la mitad hacia arriba.
  return Math.floor((200 * collectedCents + expectedCents) / (2 * expectedCents));
}
