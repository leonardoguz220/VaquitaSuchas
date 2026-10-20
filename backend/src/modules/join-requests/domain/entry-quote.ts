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

export interface QuoteGroup {
  priceCents: number;
  currency: 'USD' | 'BS';
  exchangeRate: string | null;
  totalBsCents: number;
}

/** Cotización que se guarda en la solicitud (RN-010-01, RN-010-10): copia del precio y del tipo de cambio de ese momento. */
export interface EntryQuote {
  amountCents: number;
  priceCents: number;
  currency: 'USD' | 'BS';
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
}

export function buildEntryQuote(group: QuoteGroup, currentMembers: number): EntryQuote {
  return {
    amountCents: quoteEntryShare(group.totalBsCents, currentMembers),
    priceCents: group.priceCents,
    currency: group.currency,
    exchangeRate: group.exchangeRate,
    totalBsCents: group.totalBsCents,
    memberCount: currentMembers,
  };
}
