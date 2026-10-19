import { useId, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatPrice } from '@/lib/money';
import type { QuoteStatus } from '@/hooks/use-create-group';
import type { QuoteRequest, QuoteResponse } from '@/services/groups';
import type { ApiError } from '@/services/http';
import { GROUP_MESSAGES, groupErrorMessage } from './group-messages';

export interface QuoteSummaryProps {
  /** Lo que se cotizó (los datos del formulario); `null` mientras falten datos. */
  request: QuoteRequest | null;
  status: QuoteStatus;
  quote: QuoteResponse | null;
  error: ApiError | null;
  onRetry: () => void;
  /** Botones del pie (Atrás y Crear suscripción). */
  actions?: ReactNode;
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="text-muted">{term}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}

/**
 * "Así queda la cuota" (mockup `NuevoGrupo.dc.html`): el total en Bs y la cuota por miembro que
 * devuelve `POST /groups/quote`. El frontend no calcula: solo muestra los montos de la API.
 * Lista vertical para el celular (RNF-001-04).
 */
export function QuoteSummary({
  request,
  status,
  quote,
  error,
  onRetry,
  actions,
}: QuoteSummaryProps) {
  const titleId = useId();

  return (
    <aside
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id={titleId} className="font-display text-xl font-bold">
        Así queda la cuota
      </h2>

      {status === 'idle' && (
        <p className="text-muted">
          Completa el precio, el tipo de cambio si es en dólares y los cupos para ver la cuota.
        </p>
      )}

      {request && status !== 'idle' && (
        <dl>
          <Row term="Precio">{formatPrice(request.priceCents, request.currency)}</Row>
          {request.exchangeRate && (
            <Row term="Tipo de cambio">{formatExchangeRate(request.exchangeRate)}</Row>
          )}
          <Row term="Total en Bs">{quote ? formatBs(quote.totalBsCents) : '…'}</Row>
          <Row term="Cupos">{request.memberCount}</Row>
        </dl>
      )}

      <div aria-live="polite" aria-busy={status === 'loading'} className="flex flex-col gap-1">
        {status === 'loading' && <p className="text-muted">Calculando la cuota…</p>}
        {status === 'success' && quote && (
          <div className="flex flex-col gap-1 rounded-field bg-primary-soft p-4 text-primary-hover">
            <span className="font-bold">Cada miembro pagaría</span>
            <span className="font-display text-3xl font-bold">
              {formatBs(quote.baseShareCents)}
            </span>
            <span className="text-[15px]">
              Tu parte de referencia: {formatBs(quote.ownerShareCents)}.
              {quote.remainderCents > 0 &&
                ` Tú asumes los ${formatBs(quote.remainderCents)} que sobran del redondeo.`}
            </span>
          </div>
        )}
      </div>

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={GROUP_MESSAGES.quoteFailed}
          action={
            <Button variant="secondary" onClick={onRetry}>
              Reintentar
            </Button>
          }
        >
          {groupErrorMessage(error)}
        </Alert>
      )}

      <p className="text-[15px] text-muted">Lo calcula Vaquita cada vez que cambias un dato.</p>
      {actions}
    </aside>
  );
}
