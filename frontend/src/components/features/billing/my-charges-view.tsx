'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { Alert, Badge, Button, chargeStatusLabel, Field } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useMyCharges } from '@/hooks/use-charges';
import { formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath } from '@/lib/routes';
import type { ChargeStatus, MyCharge } from '@/services/charges';
import { CHARGE_MESSAGES, chargeDueText, chargeErrorMessage } from './charge-messages';

const STATUS_FILTERS: Array<{ value: ChargeStatus | null; label: string }> = [
  { value: null, label: 'Todos' },
  ...(Object.keys(chargeStatusLabel) as ChargeStatus[]).map((value) => ({
    value,
    label: chargeStatusLabel[value],
  })),
];

const PERIOD_INPUT = /^\d{4}-(0[1-9]|1[0-2])$/;

function ChargesSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus cobros…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-24 items-center gap-4 rounded-card border border-line bg-surface p-5"
        >
          <div className="size-12 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 flex-1 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Tarjeta de un cobro (plan 002 §6; mockup `MisCobros.dc.html`): servicio, grupo, período,
 * vencimiento o fecha de pago, monto con `formatBs` e insignia con color y texto. Los cobros
 * `atrasado` de un grupo que la persona dejó llevan el aviso de la deuda (RN-002-11).
 */
function ChargeCard({ charge }: { charge: MyCharge }) {
  const formerDebt = charge.member.isFormerMember && charge.status === 'atrasado';
  return (
    <Link
      href={chargePath(charge.id)}
      className={cx(
        'flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-ink no-underline sm:p-5',
        'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ServiceLogo
          name={charge.group.serviceName}
          logoUrl={charge.group.logoUrl}
          brandColor={null}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-bold">{charge.group.name}</span>
          <span className="text-[15px] text-muted">
            {formatPeriod(charge.period)} · {chargeDueText(charge)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-bold">{formatBs(charge.amountCents)}</span>
          <Badge variant={charge.status} />
        </div>
      </div>
      {formerDebt && (
        <p className="rounded-field bg-status-atrasado-bg px-3 py-2 text-[15px] font-bold text-status-atrasado-fg">
          {CHARGE_MESSAGES.formerMemberDebt}
        </p>
      )}
    </Link>
  );
}

/**
 * "Mis cobros" `/cobros` (spec 002 T018, plan §6; mockup `MisCobros.dc.html`): los cobros de la
 * persona con filtro por estado y período, aplicados por la API (`GET /me/charges`). Cubre
 * cargando, vacío, error y con datos.
 */
export function MyChargesView() {
  const [status, setStatus] = useState<ChargeStatus | null>(null);
  const [periodInput, setPeriodInput] = useState('');
  const period = PERIOD_INPUT.test(periodInput) ? periodInput : null;
  const {
    status: loadStatus,
    error,
    reload,
    items,
    hasMore,
    loadMore,
    isLoadingMore,
    loadMoreError,
  } = useMyCharges({ status, period });
  const filtered = status !== null || period !== null;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mis cobros
        </h1>
        <p className="text-muted">Lo que te toca pagar en cada grupo donde eres miembro.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => {
            const pressed = filter.value === status;
            return (
              <button
                key={filter.label}
                type="button"
                aria-pressed={pressed}
                onClick={() => setStatus(filter.value)}
                className={cx(
                  'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  pressed
                    ? 'border-ink bg-ink font-bold text-white'
                    : 'border-field-border bg-surface text-ink hover:border-ink',
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <div className="sm:w-56">
          <Field
            type="month"
            label="Período"
            hint="Déjalo vacío para ver todos."
            value={periodInput}
            onChange={(event) => setPeriodInput(event.target.value)}
          />
        </div>
      </div>

      {(loadStatus === 'loading' || loadStatus === 'redirecting') && <ChargesSkeleton />}

      {loadStatus === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar tus cobros."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {chargeErrorMessage(error)}
        </Alert>
      )}

      {loadStatus === 'success' && items.length === 0 && (
        <section
          aria-labelledby="charges-empty-title"
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="charges-empty-title" className="font-display text-xl font-bold">
            {filtered ? 'No hay cobros con estos filtros' : 'No tienes cobros'}
          </h2>
          <p className="text-muted">
            {filtered
              ? 'Prueba con otro estado o período.'
              : 'Cuando un grupo donde eres miembro llegue a su fecha de corte, verás aquí lo que te toca pagar.'}
          </p>
        </section>
      )}

      {loadStatus === 'success' && items.length > 0 && (
        <ul aria-label="Tus cobros" className="flex flex-col gap-3">
          {items.map((charge) => (
            <li key={charge.id}>
              <ChargeCard charge={charge} />
            </li>
          ))}
        </ul>
      )}

      {loadStatus === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más cobros.">
          {chargeErrorMessage(loadMoreError)}
        </Alert>
      )}

      {loadStatus === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Ver más cobros
        </Button>
      )}
    </>
  );
}
