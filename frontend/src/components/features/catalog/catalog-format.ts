// Textos de presentación del catálogo (plan 004 §6). Solo da formato a lo que entrega la API:
// no convierte monedas ni calcula precios (CLAUDE.md §2, regla 8).
import { formatBs, formatUsd } from '@/lib/money';
import type { CatalogCurrency, CatalogService } from '@/services/catalog';

/** Precio de referencia en su moneda original: `USD 17,99` o `Bs 25,50`. */
export function formatCatalogPrice(cents: number, currency: CatalogCurrency): string {
  return currency === 'USD' ? formatUsd(cents) : formatBs(cents);
}

/** «desde USD 7,99» con el plan más barato que calcula el backend, o `null` si no vino. */
export function fromPriceLabel(
  service: Pick<CatalogService, 'fromPriceCents' | 'fromCurrency'>,
): string | null {
  if (service.fromPriceCents === undefined || service.fromCurrency === undefined) return null;
  return `desde ${formatCatalogPrice(service.fromPriceCents, service.fromCurrency)}`;
}

/** Cupos máximos del plan (RF-004-02: cantidad de personas, titular incluido). */
export function maxSlotsLabel(maxSlots: number): string {
  return `Hasta ${maxSlots} cupos (titular incluido)`;
}
