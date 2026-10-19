'use client';

import { Alert, Button } from '@/components/ui';
import type { GroupQuoteState } from '@/hooks/use-group-quote';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatUsd } from '@/lib/money';
import type { QuoteRequest } from '@/services/groups';
import { isConnectionError } from '@/services/http';
import { quoteErrorMessage } from './new-group-errors';

export interface QuotePanelProps {
  state: GroupQuoteState;
  /** Lo que se cotizó: solo se muestra con formato, no se calcula nada a partir de esto. */
  request: QuoteRequest | null;
  onRetry: () => void;
  needsExchangeRate: boolean;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

/** «Así queda la cuota»: montos tal cual los devuelve `POST /groups/quote` (plan 001 §6). */
export function QuotePanel({ state, request, onRetry, needsExchangeRate }: QuotePanelProps) {
  return (
    <section
      aria-labelledby="cuota-titulo"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h3 id="cuota-titulo" className="font-display text-xl font-bold">
        Así queda la cuota
      </h3>
      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === 'idle' && (
          <p className="text-muted">
            {needsExchangeRate
              ? 'Completa el precio, el tipo de cambio y los cupos para ver cuánto pagaría cada miembro.'
              : 'Completa el precio y los cupos para ver cuánto pagaría cada miembro.'}
          </p>
        )}
        {(state.status === 'loading' || state.status === 'redirecting') && (
          <p role="status" aria-busy="true" className="text-muted">
            Calculando la cuota…
          </p>
        )}
        {state.status === 'error' && (
          <Alert
            variant="error"
            title={quoteErrorMessage(state.error)}
            action={
              isConnectionError(state.error) ? (
                <Button variant="secondary" onClick={onRetry} className="w-full sm:w-auto">
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        )}
        {state.status === 'success' && request && (
          <>
            <dl className="flex flex-col gap-2">
              <Row
                label="Precio"
                value={
                  request.currency === 'USD'
                    ? formatUsd(request.priceCents)
                    : formatBs(request.priceCents)
                }
              />
              {request.exchangeRate && (
                <Row label="Tipo de cambio" value={formatExchangeRate(request.exchangeRate)} />
              )}
              <Row label="Total en Bs" value={formatBs(state.quote.totalBsCents)} />
              <Row label="Cupos" value={String(request.memberCount)} />
            </dl>
            <div className="flex flex-col gap-1 rounded-field bg-primary-soft p-4">
              <span className="font-bold text-primary-hover">Cada miembro pagaría</span>
              <span className="font-display text-3xl font-bold text-ink">
                {formatBs(state.quote.baseShareCents)}
              </span>
              {state.quote.remainderCents > 0 && (
                <span className="text-sm text-ink">
                  Tú asumes los {formatBs(state.quote.remainderCents)} que sobran del redondeo.
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <p className="text-sm text-muted">Lo calcula Vaquita cada vez que cambias un dato.</p>
    </section>
  );
}
