'use client';

import { Field, Select } from '@/components/ui';
import type { ListingSort } from '@/services/listings';
import { CATEGORY_OPTIONS, QUOTA_OPTIONS, SORT_OPTIONS } from './listing-options';
import { LISTING_MESSAGES } from './listing-messages';

export interface ListingFilterValues {
  service: string;
  category: string;
  quotaId: string;
  sort: ListingSort;
}

export interface ListingFiltersProps {
  values: ListingFilterValues;
  onChange: (next: ListingFilterValues) => void;
}

/**
 * Filtros de «Cupos libres» (RF-008-09): servicio, categoría, cuota y orden. Una columna en el
 * celular y una fila que se ajusta en pantallas anchas. Solo lleva los valores al padre; la API
 * filtra y ordena.
 */
export function ListingFilters({ values, onChange }: ListingFiltersProps) {
  const set = (patch: Partial<ListingFilterValues>) => onChange({ ...values, ...patch });

  return (
    <div
      role="group"
      aria-label={LISTING_MESSAGES.filtersLabel}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Field
        label={LISTING_MESSAGES.serviceLabel}
        placeholder={LISTING_MESSAGES.servicePlaceholder}
        value={values.service}
        onChange={(event) => set({ service: event.target.value })}
        autoComplete="off"
      />
      <Select
        label={LISTING_MESSAGES.categoryLabel}
        placeholder={LISTING_MESSAGES.allCategories}
        value={values.category}
        onChange={(event) => set({ category: event.target.value })}
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        label={LISTING_MESSAGES.quotaLabel}
        value={values.quotaId}
        onChange={(event) => set({ quotaId: event.target.value })}
      >
        {QUOTA_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        label={LISTING_MESSAGES.sortLabel}
        value={values.sort}
        onChange={(event) => set({ sort: event.target.value as ListingSort })}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
