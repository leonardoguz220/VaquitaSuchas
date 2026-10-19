'use client';

import { useId } from 'react';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useCatalogService } from '@/hooks/use-catalog';
import { formatPrice } from '@/lib/money';
import type { CatalogPlan, CatalogService } from '@/services/catalog';
import {
  CATALOG_MESSAGES,
  catalogLoadErrorMessage,
  isServiceUnavailable,
} from './catalog-messages';
import { ServiceLogo } from './service-logo';

function PlanSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando planes…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-16 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/** "Hasta 4 personas, contándote": los cupos máximos incluyen al titular (RF-004-02). */
export function maxSlotsLabel(maxSlots: number): string {
  return `Hasta ${maxSlots} personas, contándote`;
}

export interface PlanPickerProps {
  serviceSlug: string;
  selectedPlanSlug: string | null;
  onSelectPlan: (plan: CatalogPlan, service: CatalogService) => void;
  /** Volver a elegir el servicio (cuando ya no está disponible). */
  onChangeService: () => void;
}

/**
 * Segundo paso de "Crear suscripción" (plan 004 §6; mockup `NuevoGrupoServicio.dc.html`): los
 * planes activos del servicio en el orden de `GET /catalog/services/:slug` (por precio, CA-004-04),
 * con su precio de referencia en la moneda del plan y los cupos máximos. El precio es solo una
 * sugerencia (RN-004-01): en el paso 3 se puede cambiar.
 */
export function PlanPicker({
  serviceSlug,
  selectedPlanSlug,
  onSelectPlan,
  onChangeService,
}: PlanPickerProps) {
  const titleId = useId();
  const hintId = useId();
  const { status, data, error, reload } = useCatalogService(serviceSlug);
  const unavailable =
    (status === 'error' && isServiceUnavailable(error)) ||
    (status === 'success' && data !== null && data.plans.length === 0);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {data && (
          <ServiceLogo
            name={data.service.name}
            logoUrl={data.service.logoUrl}
            brandColor={data.service.brandColor}
          />
        )}
        <h2 id={titleId} className="font-display text-xl font-bold">
          {data ? `2. Elige el plan de ${data.service.name}` : '2. Elige el plan'}
        </h2>
      </div>

      {(status === 'loading' || status === 'redirecting') && <PlanSkeleton />}

      {unavailable && (
        <Alert
          variant="warning"
          title={CATALOG_MESSAGES.serviceUnavailable}
          action={
            <Button variant="secondary" onClick={onChangeService}>
              Elegir otro servicio
            </Button>
          }
        />
      )}

      {status === 'error' && error && !unavailable && (
        <Alert
          variant="error"
          title={CATALOG_MESSAGES.plansFailed}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {catalogLoadErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && data && !unavailable && (
        <>
          <fieldset aria-describedby={hintId} className="flex flex-col gap-3">
            <legend className="sr-only">Plan de {data.service.name}</legend>
            {data.plans.map((plan) => {
              const checked = plan.slug === selectedPlanSlug;
              return (
                <label
                  key={plan.id}
                  className={cx(
                    'flex min-h-16 cursor-pointer items-center gap-3.5 rounded-card border-[1.5px] bg-surface p-4',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                    checked ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary',
                  )}
                >
                  <input
                    type="radio"
                    name={`plan-${serviceSlug}`}
                    value={plan.slug}
                    checked={checked}
                    onChange={() => onSelectPlan(plan, data.service)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong>{plan.name}</strong>
                    <span className="text-[15px] text-muted">{maxSlotsLabel(plan.maxSlots)}</span>
                  </span>
                  <span className="font-display text-lg font-bold whitespace-nowrap">
                    {formatPrice(plan.priceCents, plan.currency)}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p id={hintId} className="text-[15px] text-muted">
            {CATALOG_MESSAGES.priceHint}
          </p>
        </>
      )}
    </section>
  );
}
