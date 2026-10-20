'use client';

import { useMemo, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListings, type ListingFilters } from '@/hooks/use-listings';
import type { CatalogCategory } from '@/services/catalog';
import { ListingCard } from './listing-card';
import { ListingFilters as FiltersBar, type ListingFilterValues } from './listing-filters';
import { LISTING_MESSAGES, listingErrorText } from './listing-messages';
import { CATEGORY_OPTIONS, quotaOption } from './listing-options';

/** Espera a que el usuario deje de escribir en el filtro de servicio antes de pedir. */
const SERVICE_DEBOUNCE_MS = 300;

const INITIAL_VALUES: ListingFilterValues = {
  service: '',
  category: '',
  quotaId: 'any',
  sort: 'cuota',
};

function ListingsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <span className="sr-only">{LISTING_MESSAGES.loading}</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-56 flex-col gap-4 rounded-card border border-line bg-surface p-5"
        >
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="h-5 flex-1 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </div>
          <div className="h-8 w-1/2 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * «Cupos libres» `/cupos` (spec 008, plan §6; mockup `Cupos.dc.html`): publicaciones con filtros y
 * orden que aplica la API (RF-008-07 a RF-008-09) y «Cargar más» con el cursor. Cubre cargando,
 * vacío, error (con Reintentar, o sin conexión) y con datos. Un `401` lleva a `/ingresar`.
 */
export function ListingsView() {
  const [values, setValues] = useState<ListingFilterValues>(INITIAL_VALUES);
  const debouncedService = useDebouncedValue(values.service, SERVICE_DEBOUNCE_MS);

  const filters: ListingFilters = useMemo(() => {
    const quota = quotaOption(values.quotaId);
    const category: CatalogCategory | null =
      CATEGORY_OPTIONS.find((option) => option.value === values.category)?.value ?? null;
    return {
      q: debouncedService.trim(),
      category,
      minShareCents: quota.minShareCents,
      maxShareCents: quota.maxShareCents,
      sort: values.sort,
    };
  }, [debouncedService, values.category, values.quotaId, values.sort]);

  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useListings(filters);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {LISTING_MESSAGES.title}
        </h1>
        <p className="text-muted">{LISTING_MESSAGES.intro}</p>
      </div>

      <FiltersBar values={values} onChange={setValues} />

      {(status === 'loading' || status === 'redirecting') && <ListingsSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={listingErrorText(error).title}
          action={
            <Button variant="secondary" onClick={reload}>
              {LISTING_MESSAGES.retry}
            </Button>
          }
        >
          {listingErrorText(error).body}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <section
          aria-labelledby="listings-empty-title"
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="listings-empty-title" className="font-display text-xl font-bold">
            {LISTING_MESSAGES.empty}
          </h2>
          <p className="text-muted">{LISTING_MESSAGES.emptyHint}</p>
        </section>
      )}

      {status === 'success' && items.length > 0 && (
        <>
          <p className="text-[15px] text-muted">{LISTING_MESSAGES.estimateNote}</p>
          <ul
            aria-label={LISTING_MESSAGES.title}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {items.map((listing) => (
              <li key={listing.id}>
                <ListingCard listing={listing} />
              </li>
            ))}
          </ul>
        </>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title={LISTING_MESSAGES.loadMoreFailed}>
          {listingErrorText(loadMoreError).body}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          {LISTING_MESSAGES.loadMore}
        </Button>
      )}
    </>
  );
}
