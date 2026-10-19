'use client';

import { useId } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useGroupCharges } from '@/hooks/use-charges';
import { formatDateTimeLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath } from '@/lib/routes';
import { isFullCharge, type GroupChargeItem } from '@/services/charges';
import { chargeErrorMessage } from './charge-messages';

const REVIEW_FILTER = { status: 'en_revision' } as const;

function queueTitle(count: number, hasMore: boolean): string {
  if (count === 0) return 'Por revisar';
  const more = hasMore ? ' o más' : '';
  return `Por revisar · ${count}${more} ${count === 1 && !hasMore ? 'comprobante' : 'comprobantes'}`;
}

function QueueItem({ charge }: { charge: GroupChargeItem }) {
  const uploadedAt =
    isFullCharge(charge) && charge.currentReceipt ? charge.currentReceipt.uploadedAt : null;
  return (
    <li className="flex flex-col gap-3 rounded-field border border-line p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold">
          {charge.member.fullName} · {formatPeriod(charge.period)}
        </span>
        <span className="text-[15px] text-muted">
          {uploadedAt
            ? `Subió su pago de ${formatBs(charge.amountCents)} el ${formatDateTimeLaPaz(uploadedAt)}.`
            : `Pago de ${formatBs(charge.amountCents)} por revisar.`}
        </span>
      </div>
      <Badge variant={charge.status} className="self-start sm:self-center" />
      <Button href={chargePath(charge.id)} className="w-full sm:w-auto">
        Revisar comprobante
      </Button>
    </li>
  );
}

/**
 * Cola «Por revisar» del titular en la pestaña **Cobros** de `/grupos/[id]` (spec 002 T026,
 * plan §6; mockup `Grupo.dc.html`): los cobros `en_revision` que filtra la API
 * (`GET /groups/:id/charges?status=en_revision`), con enlace al detalle para confirmar o
 * rechazar. Cubre cargando, vacío, error y con datos.
 */
export function ReviewQueue({ groupId }: { groupId: string }) {
  const titleId = useId();
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useGroupCharges(groupId, REVIEW_FILTER);

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        {status === 'success' ? queueTitle(items.length, hasMore) : 'Por revisar'}
      </h2>

      {(status === 'loading' || status === 'redirecting') && (
        <div role="status" aria-busy="true">
          <span className="sr-only">Cargando los comprobantes por revisar…</span>
          <div
            aria-hidden="true"
            className="h-20 animate-pulse rounded-field bg-line motion-reduce:animate-none"
          />
        </div>
      )}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar los comprobantes por revisar."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {chargeErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <p className="text-muted">No hay comprobantes por revisar.</p>
      )}

      {status === 'success' && items.length > 0 && (
        <ul aria-label="Comprobantes por revisar" className="flex flex-col gap-3">
          {items.map((charge) => (
            <QueueItem key={charge.id} charge={charge} />
          ))}
        </ul>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más comprobantes.">
          {chargeErrorMessage(loadMoreError)}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="sm:self-start"
        >
          Ver más comprobantes
        </Button>
      )}
    </Card>
  );
}
