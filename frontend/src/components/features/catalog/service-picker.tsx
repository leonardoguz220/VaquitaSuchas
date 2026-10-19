'use client';

import { useId } from 'react';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useCatalogServices } from '@/hooks/use-catalog';
import { formatPrice } from '@/lib/money';
import type { CatalogService } from '@/services/catalog';
import { CATALOG_MESSAGES, catalogLoadErrorMessage } from './catalog-messages';
import { ServiceLogo } from './service-logo';

// Tarjeta seleccionable de ancho completo en el celular, con área táctil sobrada (>= 64 px).
const cardClass =
  'flex min-h-16 w-full items-center gap-3.5 rounded-card border-[1.5px] bg-surface p-4 text-left text-ink ' +
  'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-6 shrink-0 text-primary"
      fill="currentColor"
    >
      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.8 5.3 1.3 1.3-6 6-3.4-3.4 1.3-1.3 2.1 2.1 4.7-4.7Z" />
    </svg>
  );
}

function ServiceSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Cargando servicios…</span>
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex min-h-16 items-center gap-3.5 rounded-card border border-line bg-surface p-4"
        >
          <div className="size-12 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-5 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="h-4 w-1/2 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ServiceCardProps {
  service: CatalogService;
  selected: boolean;
  onSelect: () => void;
}

function ServiceCard({ service, selected, onSelect }: ServiceCardProps) {
  // "desde …" en la moneda del plan más barato, tal como lo entrega la API (sin convertir).
  const fromPrice =
    service.fromPriceCents !== undefined && service.fromCurrency
      ? formatPrice(service.fromPriceCents, service.fromCurrency)
      : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(cardClass, selected ? 'border-primary bg-primary-soft' : 'border-line')}
    >
      <ServiceLogo name={service.name} logoUrl={service.logoUrl} brandColor={service.brandColor} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{service.name}</span>
        <span className="text-[15px] text-muted">
          {service.categoryLabel}
          {fromPrice && ` · desde ${fromPrice}`}
        </span>
      </span>
      {selected && <CheckMark />}
    </button>
  );
}

export interface ServicePickerProps {
  selectedSlug: string | null;
  customSelected: boolean;
  onSelectService: (service: CatalogService) => void;
  onSelectCustom: () => void;
}

/**
 * Primer paso de "Crear suscripción" (plan 004 §6; mockup `NuevoGrupoServicio.dc.html`):
 * tarjetas con el logo, el nombre, la categoría y el precio "desde" en la moneda del plan, tal
 * como lo entrega `GET /catalog/services` (sin convertir monedas). La última tarjeta ofrece un
 * servicio personalizado (RF-004-09). Cubre cargando, vacío, error y con datos.
 */
export function ServicePicker({
  selectedSlug,
  customSelected,
  onSelectService,
  onSelectCustom,
}: ServicePickerProps) {
  const titleId = useId();
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useCatalogServices();

  const customCard = (
    <button
      type="button"
      aria-pressed={customSelected}
      onClick={onSelectCustom}
      className={cx(
        cardClass,
        'border-dashed',
        customSelected ? 'border-primary bg-primary-soft' : 'border-field-border',
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-field bg-bg text-2xl font-bold text-primary"
      >
        +
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">¿No está tu servicio?</span>
        <span className="text-[15px] text-primary underline">Crear uno personalizado</span>
      </span>
      {customSelected && <CheckMark />}
    </button>
  );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        1. Elige el servicio
      </h2>

      {(status === 'loading' || status === 'redirecting') && <ServiceSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={CATALOG_MESSAGES.servicesFailed}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {catalogLoadErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <Alert variant="info" title={CATALOG_MESSAGES.servicesEmpty}>
          {CATALOG_MESSAGES.servicesEmptyHint}
        </Alert>
      )}

      {(status === 'success' || status === 'error') && (
        <ul aria-label="Servicios" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((service) => (
            <li key={service.id} className="flex">
              <ServiceCard
                service={service}
                selected={service.slug === selectedSlug}
                onSelect={() => onSelectService(service)}
              />
            </li>
          ))}
          <li className="flex">{customCard}</li>
        </ul>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title={CATALOG_MESSAGES.moreFailed}>
          {catalogLoadErrorMessage(loadMoreError)}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Ver más servicios
        </Button>
      )}
    </section>
  );
}
