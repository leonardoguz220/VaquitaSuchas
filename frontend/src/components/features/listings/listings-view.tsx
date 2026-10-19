'use client';

import { useState } from 'react';
import { Alert, Button, Select } from '@/components/ui';
import { useCatalogCategories, useCatalogServices } from '@/hooks/use-catalog';
import { useListings, type ListingFilters } from '@/hooks/use-listings';
import { formatBs } from '@/lib/money';
import { listingPath } from '@/lib/routes';
import type { ListingSort } from '@/services/listings';
import { ListingCard } from './listing-card';
import { listingLoadErrorMessage } from './listing-messages';

/** Topes de cuota del filtro (en centavos): solo opciones del filtro, la API filtra. */
const SHARE_LIMITS = [1500, 2500, 5000] as const;

const SORT_OPTIONS: Array<{ value: ListingSort; label: string }> = [
  { value: 'fecha', label: 'Más recientes' },
  { value: 'cuota', label: 'Menor cuota primero' },
  { value: 'puntualidad', label: 'Titular más puntual' },
];

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
      <span className="sr-only">Cargando cupos libres…</span>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-56 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function Filters({
  filters,
  onChange,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
}) {
  const services = useCatalogServices();
  const categories = useCatalogCategories();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label="Servicio"
        value={filters.serviceId ?? ''}
        onChange={(event) => onChange({ ...filters, serviceId: event.target.value || undefined })}
      >
        <option value="">Todos los servicios</option>
        {services.items.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </Select>
      <Select
        label="Categoría"
        value={filters.category ?? ''}
        onChange={(event) => onChange({ ...filters, category: event.target.value || undefined })}
      >
        <option value="">Todas las categorías</option>
        {(categories.data?.items ?? []).map((category) => (
          <option key={category.value} value={category.value}>
            {category.label}
          </option>
        ))}
      </Select>
      <Select
        label="Cuota estimada"
        value={filters.maxShareCents === undefined ? '' : String(filters.maxShareCents)}
        onChange={(event) =>
          onChange({
            ...filters,
            maxShareCents: event.target.value ? Number(event.target.value) : undefined,
          })
        }
      >
        <option value="">Cualquier cuota</option>
        {SHARE_LIMITS.map((limit) => (
          <option key={limit} value={limit}>
            Hasta {formatBs(limit)}
          </option>
        ))}
      </Select>
      <Select
        label="Ordenar por"
        value={filters.sort ?? 'fecha'}
        onChange={(event) => onChange({ ...filters, sort: event.target.value as ListingSort })}
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

/**
 * `/cupos` (spec 008 T015, plan §6; mockup `Cupos.dc.html`): publicaciones activas con servicio,
 * cupos, **cuota estimada** con su rótulo, día de cobro, titular con su nivel y estado de la
 * ventana; filtros por servicio, categoría y cuota, orden y «Cargar más». Las publicaciones
 * propias y las de sus grupos no llegan (RF-008-08): lo resuelve la API.
 */
export function ListingsView() {
  const [filters, setFilters] = useState<ListingFilters>({ sort: 'fecha' });
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useListings(filters);
  const filtered = Boolean(filters.serviceId || filters.category || filters.maxShareCents);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Cupos libres
        </h1>
        <p className="text-muted">
          Grupos que buscan miembros. Solo puedes pedir un cupo durante su ventana de ingreso.
        </p>
      </div>

      <section aria-label="Filtros" className="flex flex-col gap-3">
        <Filters filters={filters} onChange={setFilters} />
      </section>

      {(status === 'loading' || status === 'redirecting') && <ListSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar los cupos libres."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {listingLoadErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <p className="font-bold">
            {filtered
              ? 'No hay cupos libres con esos filtros.'
              : 'Por ahora no hay cupos libres publicados.'}
          </p>
          <p className="text-muted">
            {filtered
              ? 'Prueba con otro servicio o con una cuota más alta.'
              : 'Vuelve más tarde o únete a un grupo con el código que te comparta su titular.'}
          </p>
          {filtered && (
            <Button
              variant="secondary"
              onClick={() => setFilters({ sort: filters.sort })}
              className="w-full sm:w-auto sm:self-start"
            >
              Quitar filtros
            </Button>
          )}
        </div>
      )}

      {status === 'success' && items.length > 0 && (
        <>
          <ul aria-label="Publicaciones" className="grid gap-3 sm:grid-cols-2">
            {items.map((listing) => (
              <li key={listing.id} className="flex">
                <ListingCard listing={listing} href={listingPath(listing.id)} className="flex-1" />
              </li>
            ))}
          </ul>
          {loadMoreError && <Alert variant="error">{listingLoadErrorMessage(loadMoreError)}</Alert>}
          {hasMore && (
            <Button
              variant="secondary"
              onClick={() => void loadMore()}
              loading={isLoadingMore}
              className="w-full sm:w-auto sm:self-center"
            >
              Cargar más
            </Button>
          )}
        </>
      )}
    </>
  );
}
