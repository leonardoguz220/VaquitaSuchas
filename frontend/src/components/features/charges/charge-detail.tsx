'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useCharge } from '@/hooks/use-charge';
import { formatDateTimeLaPaz, formatPeriod } from '@/lib/dates';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatUsd } from '@/lib/money';
import type { Charge } from '@/services/charges';
import { CHARGES_PATH, FORMER_MEMBER_NOTICE } from './charge-labels';
import { ChargeDue } from './charge-due';
import { ChargePaymentInfo } from './charge-payment-info';
import { ChargeTimeline } from './charge-timeline';

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el cobro…</span>
      <div
        aria-hidden="true"
        className="h-9 w-56 animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          aria-hidden="true"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <div className="h-6 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <Card
      as="section"
      aria-labelledby="charge-unavailable"
      className="flex flex-col items-start gap-3"
    >
      <h1 id="charge-unavailable" className="font-display text-2xl font-bold">
        {title}
      </h1>
      <p className="text-muted">{text}</p>
      <Button href={CHARGES_PATH}>Ir a Mis cobros</Button>
    </Card>
  );
}

function amountRows(charge: Charge): { label: string; value: string }[] {
  const price =
    charge.currency === 'USD' ? formatUsd(charge.priceCents) : formatBs(charge.priceCents);
  const rows = [{ label: 'Precio del plan', value: price }];
  if (charge.currency === 'USD' && charge.exchangeRate) {
    rows.push({
      label: 'Tipo de cambio del cobro',
      value: `Bs ${formatExchangeRate(charge.exchangeRate)} por USD 1`,
    });
  }
  rows.push(
    { label: 'Total del mes', value: formatBs(charge.totalBsCents) },
    { label: 'Miembros, contando al titular', value: String(charge.memberCount) },
  );
  return rows;
}

function ChargeHeader({ charge }: { charge: Charge }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {`Cobro de ${formatPeriod(charge.period)}`}
        </h1>
        <p className="text-[15px] text-muted">
          {charge.origin === 'ingreso' ? 'Pago de ingreso · ' : ''}
          {`A nombre de ${charge.member.fullName}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-display text-4xl font-bold">{formatBs(charge.amountCents)}</p>
        <Badge variant={charge.status} />
      </div>
      {!charge.member.isFormerMember && (
        <Link
          href={`/grupos/${charge.groupId}`}
          className="inline-flex min-h-11 items-center self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Ver el grupo
        </Link>
      )}
    </header>
  );
}

function LastRejection({ rejection }: { rejection: NonNullable<Charge['lastRejection']> }) {
  return (
    <Alert variant="warning" title="Motivo del último rechazo">
      <p className="break-words">{rejection.reason}</p>
      {rejection.invalidReceipt && <p>El titular marcó el comprobante como inválido.</p>}
      <p className="text-[15px]">{`Rechazado el ${formatDateTimeLaPaz(rejection.at)}.`}</p>
    </Alert>
  );
}

function AmountSection({ charge }: { charge: Charge }) {
  return (
    <Card as="section" aria-labelledby="charge-amount" className="flex flex-col gap-2">
      <h2 id="charge-amount" className="font-display text-xl font-bold">
        De dónde sale el monto
      </h2>
      <dl aria-label="Datos del cobro" className="flex flex-col divide-y divide-line">
        {amountRows(charge).map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 py-3"
          >
            <dt className="text-muted">{row.label}</dt>
            <dd className="font-bold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export interface ChargeActionsContext {
  /** Muestra el cobro que devolvió la API tras la acción. */
  onChargeChange: (charge: Charge) => void;
}

export interface ChargeDetailViewProps {
  chargeId: string;
  /**
   * Zona de acciones según `allowedActions` (subir comprobante en T022, confirmar y rechazar
   * en T026). Solo se monta si la API permite alguna acción.
   */
  actions?: (charge: Charge, context: ChargeActionsContext) => ReactNode;
  /** Aviso tras una acción (T026), bajo la cabecera del cobro. */
  notice?: ReactNode;
}

/**
 * Pantalla `/cobros/[id]` de solo lectura (plan 002 §6, RF-002-09; mockup `Cobro.dc.html`):
 * monto, estado, vencimiento, datos de pago, motivo del último rechazo y línea de tiempo.
 * `403` → «No tienes acceso a este cobro»; `404` → «Cobro no encontrado».
 */
export function ChargeDetailView({ chargeId, actions, notice }: ChargeDetailViewProps) {
  const { state, retry, update } = useCharge(chargeId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={CHARGES_PATH}
        className="inline-flex min-h-11 items-center self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span aria-hidden="true">←&nbsp;</span>Mis cobros
      </Link>

      {state.status === 'loading' && <DetailSkeleton />}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'forbidden' && (
        <Unavailable
          title="No tienes acceso a este cobro"
          text="Solo el miembro del cobro y el titular del grupo pueden ver su detalle."
        />
      )}
      {state.status === 'not_found' && (
        <Unavailable
          title="Cobro no encontrado"
          text="Este cobro no existe o no pertenece a tus grupos."
        />
      )}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="el cobro" onRetry={retry} />
      )}

      {state.status === 'success' && (
        <>
          <ChargeHeader charge={state.charge} />
          {notice}
          {state.charge.member.isFormerMember && (
            <Alert variant="warning" title={FORMER_MEMBER_NOTICE} />
          )}
          {state.charge.lastRejection && <LastRejection rejection={state.charge.lastRejection} />}
          <ChargeDue charge={state.charge} />
          <ChargePaymentInfo paymentInfo={state.charge.paymentInfo} />
          {actions && state.charge.allowedActions.length > 0 && (
            <section aria-label="Acciones del cobro" className="flex flex-col gap-4">
              {actions(state.charge, { onChargeChange: update })}
            </section>
          )}
          <AmountSection charge={state.charge} />
          <ChargeTimeline events={state.charge.timeline} />
        </>
      )}
    </div>
  );
}
