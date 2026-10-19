/**
 * Opciones de los filtros de «Cupos libres» (RF-008-09). Cada opción traduce a los parámetros del
 * contrato (`minShareCents`, `maxShareCents`, `sort`); la API hace el filtrado y el orden.
 */
import { formatBs } from '@/lib/money';
import type { CatalogCategory } from '@/services/catalog';
import type { ListingSort } from '@/services/listings';
import { CATEGORY_LABEL } from './listing-messages';

export const CATEGORY_OPTIONS: Array<{ value: CatalogCategory; label: string }> = (
  Object.keys(CATEGORY_LABEL) as CatalogCategory[]
).map((value) => ({ value, label: CATEGORY_LABEL[value] }));

export interface QuotaOption {
  id: string;
  label: string;
  minShareCents: number | null;
  maxShareCents: number | null;
}

export const QUOTA_OPTIONS: QuotaOption[] = [
  { id: 'any', label: 'Cualquier cuota', minShareCents: null, maxShareCents: null },
  {
    id: 'hasta-15',
    label: `Hasta ${formatBs(1500)}`,
    minShareCents: null,
    maxShareCents: 1500,
  },
  {
    id: 'entre-15-25',
    label: `Entre ${formatBs(1500)} y ${formatBs(2500)}`,
    minShareCents: 1500,
    maxShareCents: 2500,
  },
  {
    id: 'desde-25',
    label: `Desde ${formatBs(2500)}`,
    minShareCents: 2500,
    maxShareCents: null,
  },
];

export const SORT_OPTIONS: Array<{ value: ListingSort; label: string }> = [
  { value: 'cuota', label: 'Menor cuota primero' },
  { value: 'fecha', label: 'Más recientes' },
  { value: 'puntualidad', label: 'Mejor puntualidad del titular' },
];

/** Opción de cuota por su id; la primera (sin límite) si no existe. */
export function quotaOption(id: string): QuotaOption {
  return QUOTA_OPTIONS.find((option) => option.id === id) ?? QUOTA_OPTIONS[0];
}
