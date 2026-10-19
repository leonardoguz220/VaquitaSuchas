'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert, Button } from '@/components/ui';
import type { UseCatalogServiceResult } from '@/hooks/use-catalog-service';
import type { CatalogPlan } from '@/services/catalog';
import { isConnectionError } from '@/services/http';
import { formatCatalogPrice, maxSlotsLabel } from './catalog-format';

const SKELETON_PLANS = [0, 1, 2];

function PlansSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando planes…</span>
      <ul aria-hidden="true" className="flex flex-col gap-3">
        {SKELETON_PLANS.map((plan) => (
          <li
            key={plan}
            data-testid="plan-skeleton"
            className="flex min-h-20 items-center gap-4 rounded-card border border-line bg-surface p-4"
          >
            <div className="size-5 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-32 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
              <div className="h-3 w-48 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanOption({
  plan,
  name,
  checked,
  onChange,
}: {
  plan: CatalogPlan;
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={
        'flex min-h-11 cursor-pointer items-start gap-3 rounded-card border-[1.5px] p-4 transition-colors ' +
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ' +
        (checked ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary')
      }
    >
      <input
        type="radio"
        name={name}
        value={plan.slug}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-none"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-bold">{plan.name}</span>
          <span className="font-display text-lg font-bold">
            {formatCatalogPrice(plan.priceCents, plan.currency)}{' '}
            <span className="font-sans text-sm font-normal text-muted">al mes</span>
          </span>
        </span>
        <span className="text-sm text-muted">{maxSlotsLabel(plan.maxSlots)}</span>
        {plan.individualPriceCents !== null && (
          <span className="text-sm text-muted">
            Precio individual: {formatCatalogPrice(plan.individualPriceCents, plan.currency)}
          </span>
        )}
      </span>
    </label>
  );
}

function PlanForm({
  plans,
  defaultPlanSlug,
  onSelect,
}: {
  plans: CatalogPlan[];
  defaultPlanSlug?: string;
  onSelect: (plan: CatalogPlan) => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    plans.some((plan) => plan.slug === defaultPlanSlug) ? (defaultPlanSlug ?? null) : null,
  );
  const [showError, setShowError] = useState(false);
  const groupName = useId();
  const errorId = useId();
  const legendId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const plan = plans.find((candidate) => candidate.slug === selected);
    if (!plan) {
      setShowError(true);
      return;
    }
    onSelect(plan);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* Los planes llegan ordenados por precio ascendente desde la API (CA-004-04): no se reordenan. */}
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        aria-describedby={showError ? errorId : undefined}
        className="flex flex-col gap-3"
      >
        <span id={legendId} className="sr-only">
          Plan
        </span>
        {plans.map((plan) => (
          <PlanOption
            key={plan.id}
            plan={plan}
            name={groupName}
            checked={selected === plan.slug}
            onChange={() => {
              setSelected(plan.slug);
              setShowError(false);
            }}
          />
        ))}
      </div>
      {showError && (
        <p id={errorId} className="font-bold text-danger">
          Elige un plan para continuar.
        </p>
      )}
      <p className="text-sm text-muted">El precio es una sugerencia: podrás cambiarlo</p>
      <Button type="submit" className="w-full sm:w-auto sm:self-end">
        Siguiente: datos del grupo
      </Button>
    </form>
  );
}

export interface PlanPickerProps {
  detail: UseCatalogServiceResult;
  onSelect: (plan: CatalogPlan) => void;
  /** Vuelve al paso 1 (por ejemplo, cuando el servicio ya no está disponible). */
  onBack: () => void;
  /** Plan que queda marcado al volver desde el paso 3. */
  defaultPlanSlug?: string;
}

/**
 * Paso 2 de `/grupos/nuevo` (plan 004 §6): planes activos del servicio con precio de referencia
 * en su moneda, cupos máximos y precio individual si existe, tal como los entrega la API.
 */
export function PlanPicker({ detail, onSelect, onBack, defaultPlanSlug }: PlanPickerProps) {
  const { state, retry } = detail;

  if (state.status === 'idle' || state.status === 'loading') return <PlansSkeleton />;
  if (state.status === 'redirecting') {
    return (
      <p role="status" className="text-muted">
        Redirigiendo para iniciar sesión…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert
        variant="error"
        title={
          isConnectionError(state.error)
            ? 'No se pudo contactar con el servidor.'
            : 'No pudimos cargar los planes.'
        }
        action={
          <Button onClick={retry} className="w-full sm:w-auto">
            Reintentar
          </Button>
        }
      >
        Vuelve a intentarlo en unos segundos.
      </Alert>
    );
  }

  // El backend responde 404 si el servicio se desactivó o ya no tiene planes activos.
  if (state.status === 'not_found' || state.plans.length === 0) {
    return (
      <Alert
        variant="error"
        title="Este servicio ya no está disponible"
        action={
          <Button variant="secondary" onClick={onBack} className="w-full sm:w-auto">
            Elegir otro servicio
          </Button>
        }
      >
        Elige otro servicio del catálogo o crea una suscripción personalizada.
      </Alert>
    );
  }

  return <PlanForm plans={state.plans} defaultPlanSlug={defaultPlanSlug} onSelect={onSelect} />;
}
