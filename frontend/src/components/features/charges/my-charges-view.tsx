'use client';

import { useState } from 'react';
import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { Button, Select } from '@/components/ui';
import { useMyCharges } from '@/hooks/use-my-charges';
import { formatPeriod, recentPeriods } from '@/lib/dates';
import type { ChargeStatus } from '@/services/charges';
import { ChargeCard } from './charge-card';
import { STATUS_FILTERS } from './charge-labels';

const PERIOD_OPTIONS = 6;
const SKELETON_CARDS = [0, 1, 2];

function ChargesSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando tus cobros…</span>
      <ul aria-hidden="true" className="flex flex-col gap-3">
        {SKELETON_CARDS.map((card) => (
          <li
            key={card}
            data-testid="charge-skeleton"
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
          >
            <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-5 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
              <div className="h-4 w-28 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function isChargeStatus(value: string): value is ChargeStatus {
  return STATUS_FILTERS.some((filter) => filter.value === value);
}

/**
 * Pantalla `/cobros`, «Mis cobros» (plan 002 §6, RF-002-15; mockup `MisCobros.dc.html`). Los
 * filtros por estado y período van como query de `GET /me/charges`; no se filtra en el cliente.
 */
export function MyChargesView() {
  const [status, setStatus] = useState<ChargeStatus | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [periods] = useState(() => recentPeriods(new Date(), PERIOD_OPTIONS));
  const { state, retry } = useMyCharges({ status, period });
  const filtered = status !== null || period !== null;

  function clearFilters() {
    setStatus(null);
    setPeriod(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mis cobros
        </h1>
        <p className="text-muted">Lo que te toca pagar en cada grupo donde eres miembro.</p>
      </header>

      <div
        role="group"
        aria-label="Filtrar cobros"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Select
          label="Estado"
          value={status ?? ''}
          onChange={(event) =>
            setStatus(isChargeStatus(event.target.value) ? event.target.value : null)
          }
        >
          <option value="">Todos</option>
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </Select>
        <Select
          label="Período"
          value={period ?? ''}
          onChange={(event) => setPeriod(event.target.value || null)}
        >
          <option value="">Todos los períodos</option>
          {periods.map((value) => (
            <option key={value} value={value}>
              {formatPeriod(value)}
            </option>
          ))}
        </Select>
      </div>

      {state.status === 'loading' && <ChargesSkeleton />}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="tus cobros" onRetry={retry} />
      )}

      {state.status === 'success' && state.items.length === 0 && !filtered && (
        <section
          aria-labelledby="charges-empty-title"
          className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="charges-empty-title" className="font-display text-xl font-bold">
            Aún no tienes cobros
          </h2>
          <p className="text-muted">
            Cuando un grupo en el que eres miembro llegue a su fecha de corte, tu cobro aparecerá
            aquí.
          </p>
          <Button variant="secondary" href="/grupos">
            Ir a Mis suscripciones
          </Button>
        </section>
      )}

      {state.status === 'success' && state.items.length === 0 && filtered && (
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5"
        >
          <p className="font-bold">No hay cobros con estos filtros.</p>
          <Button variant="secondary" onClick={clearFilters}>
            Quitar filtros
          </Button>
        </div>
      )}

      {state.status === 'success' && state.items.length > 0 && (
        <ul aria-label="Tus cobros" className="flex flex-col gap-3">
          {state.items.map((charge) => (
            <li key={charge.id} className="flex flex-col">
              <ChargeCard charge={charge} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
