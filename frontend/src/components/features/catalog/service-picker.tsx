'use client';

import { Alert, Button } from '@/components/ui';
import type { UseCatalogServicesResult } from '@/hooks/use-catalog-services';
import type { CatalogService } from '@/services/catalog';
import { isConnectionError, type ApiError } from '@/services/http';
import { fromPriceLabel } from './catalog-format';
import { ServiceLogo } from './ServiceLogo';

// Tarjeta táctil: ancho completo en celular, 80 px de alto (> 44 px), foco visible.
const CARD =
  'flex w-full min-h-20 items-center gap-4 rounded-card border-[1.5px] bg-surface p-4 text-left ' +
  'transition-colors hover:border-primary hover:bg-primary-soft ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const SKELETON_CARDS = [0, 1, 2, 3, 4, 5];

function ServiceCard({ service, onSelect }: { service: CatalogService; onSelect: () => void }) {
  const from = fromPriceLabel(service);
  return (
    <button type="button" onClick={onSelect} className={`${CARD} border-line`}>
      <ServiceLogo name={service.name} logoUrl={service.logoUrl} brandColor={service.brandColor} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{service.name}</span>
        <span className="text-sm text-muted">{service.categoryLabel}</span>
        {from && <span className="text-sm font-bold text-ink">{from}</span>}
      </span>
    </button>
  );
}

function CustomCard({ onCustom }: { onCustom: () => void }) {
  return (
    <button
      type="button"
      onClick={onCustom}
      className={`${CARD} border-dashed border-field-border`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-muted font-display text-2xl leading-none font-bold text-white"
      >
        +
      </span>
      <span className="flex flex-col">
        <span className="text-sm text-muted">¿No está tu servicio?</span>
        <span className="font-bold text-primary">Crear uno personalizado</span>
      </span>
    </button>
  );
}

function ServicesSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando servicios…</span>
      <ul aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_CARDS.map((card) => (
          <li
            key={card}
            data-testid="service-skeleton"
            className="flex min-h-20 items-center gap-4 rounded-card border border-line bg-surface p-4"
          >
            <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-28 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
              <div className="h-3 w-20 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function errorTitle(error: ApiError): string {
  return isConnectionError(error)
    ? 'No se pudo contactar con el servidor.'
    : 'No pudimos cargar el catálogo.';
}

export interface ServicePickerProps {
  catalog: UseCatalogServicesResult;
  onSelect: (service: CatalogService) => void;
  /** «¿No está tu servicio? Crear uno personalizado» (RF-004-09, spec 001). */
  onCustom: () => void;
}

/**
 * Paso 1 de `/grupos/nuevo` (plan 004 §6; mockup `NuevoGrupoServicio.dc.html`): tarjetas de
 * servicio con logo, nombre, categoría y «desde …» tal como los entrega la API, y al final la
 * tarjeta del servicio personalizado. Cubre cargando, vacío, error y con datos.
 */
export function ServicePicker({ catalog, onSelect, onCustom }: ServicePickerProps) {
  const { state, retry, loadMore, isLoadingMore, loadMoreFailed } = catalog;

  if (state.status === 'loading') return <ServicesSkeleton />;
  if (state.status === 'redirecting') {
    return (
      <p role="status" className="text-muted">
        Redirigiendo para iniciar sesión…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' && (
        <Alert
          variant="error"
          title={errorTitle(state.error)}
          action={
            <Button onClick={retry} className="w-full sm:w-auto">
              Reintentar
            </Button>
          }
        >
          Vuelve a intentarlo en unos segundos. Mientras tanto, puedes crear una suscripción
          personalizada.
        </Alert>
      )}

      {state.status === 'success' && state.items.length === 0 && (
        <div role="status" className="rounded-card border border-line bg-surface p-5">
          <p className="font-bold">Todavía no hay servicios en el catálogo.</p>
          <p className="text-muted">
            Puedes crear una suscripción personalizada con el nombre de tu servicio.
          </p>
        </div>
      )}

      {state.status === 'success' && state.items.length > 0 && (
        <ul
          aria-label="Servicios del catálogo"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {state.items.map((service) => (
            <li key={service.id} className="flex">
              <ServiceCard service={service} onSelect={() => onSelect(service)} />
            </li>
          ))}
        </ul>
      )}

      {state.status === 'success' && state.nextCursor !== null && (
        <div className="flex flex-col gap-3">
          {loadMoreFailed && (
            <Alert variant="error" title="No pudimos cargar más servicios.">
              Vuelve a intentarlo.
            </Alert>
          )}
          <Button
            variant="secondary"
            onClick={loadMore}
            loading={isLoadingMore}
            className="w-full sm:w-auto sm:self-center"
          >
            Ver más servicios
          </Button>
        </div>
      )}

      <CustomCard onCustom={onCustom} />
    </div>
  );
}
