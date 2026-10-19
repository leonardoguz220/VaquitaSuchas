export type Currency = 'BS' | 'USD';

const RATE_SCALE = 10_000;

/** Tipo de cambio decimal positivo con hasta 4 decimales (RN-001-04) → entero ×10⁴; null si no es válido. */
export function parseExchangeRate(raw: string | number): number | null {
  const text = typeof raw === 'number' ? String(raw) : raw.trim();
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) return null;
  const scaled = Number(match[1]) * RATE_SCALE + Number((match[2] ?? '').padEnd(4, '0'));
  return Number.isSafeInteger(scaled) && scaled > 0 ? scaled : null;
}

/**
 * Total en Bs (centavos). `BS`: igual al precio. `USD`: `floor((precio × tasa×10⁴ + 5000) / 10⁴)`,
 * mitad hacia arriba, igual que la columna generada `groups.total_bs_cents` (RF-001-11).
 */
export function computeTotalBsCents(
  currency: Currency,
  priceCents: number,
  exchangeRate?: string | number | null,
): number {
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    throw new Error('El precio debe ser un entero positivo de centavos.');
  }
  if (currency === 'BS') return priceCents;
  const scaled = exchangeRate == null ? null : parseExchangeRate(exchangeRate);
  if (scaled === null) throw new Error('Tipo de cambio inválido.');
  return Number((BigInt(priceCents) * BigInt(scaled) + 5000n) / BigInt(RATE_SCALE));
}
