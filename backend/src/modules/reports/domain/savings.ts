export interface SavingsInput {
  individualPriceBsCents: number | null;
  shareCents: number;
}

export interface SavingsSummary {
  /** `null` si ninguna suscripción tiene dato (todas «sin dato»). */
  totalCents: number | null;
  /** Cantidad de líneas sin precio individual de referencia. */
  withoutData: number;
  negativeNote: string | null;
}

export const NEGATIVE_SAVINGS_NOTE =
  'Un ahorro negativo significa que, con el precio individual de referencia, el plan compartido te cuesta más.';

/** Ahorro estimado de una línea (RN-006-03): `precio individual − cuota`; `null` si no hay dato. */
export function savingsForLine(
  individualBsCents: number | null,
  shareCents: number,
): number | null {
  if (individualBsCents === null) return null;
  return individualBsCents - shareCents;
}

/** Total de ahorro, líneas «sin dato» y nota si alguna línea (o el total) es negativa (CA-006-21). */
export function summarizeSavings(lines: readonly SavingsInput[]): SavingsSummary {
  let total = 0;
  let withData = 0;
  let withoutData = 0;
  let anyNegative = false;
  for (const line of lines) {
    const saving = savingsForLine(line.individualPriceBsCents, line.shareCents);
    if (saving === null) {
      withoutData += 1;
      continue;
    }
    withData += 1;
    total += saving;
    if (saving < 0) anyNegative = true;
  }
  return {
    totalCents: withData === 0 ? null : total,
    withoutData,
    negativeNote: anyNegative || total < 0 ? NEGATIVE_SAVINGS_NOTE : null,
  };
}
