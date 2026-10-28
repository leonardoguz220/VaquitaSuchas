'use client';

import { Alert, Badge, Button, Card } from '@/components/ui';
import { useApiResource } from '@/hooks/use-api-resource';
import { formatDateLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { listDisputedRefunds, type DisputedRefund } from '@/services/shortfalls';

const METHOD_LABEL = { qr: 'QR', transferencia: 'Transferencia', efectivo: 'Efectivo' } as const;

/**
 * `/admin/devoluciones` (spec 011 T017): devoluciones del faltante de grupo disputadas por el
 * miembro. Solo lectura: Vaquita no mueve dinero, el equipo media el caso fuera de la app.
 */
export function AdminRefundDisputesView() {
  const queue = useApiResource(listDisputedRefunds);
  const items = queue.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl tracking-tight">Devoluciones disputadas</h1>

      {queue.status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando devoluciones…
        </p>
      )}

      {queue.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" title="No se pudo cargar la cola">
            {queue.error?.message}
          </Alert>
          <Button variant="secondary" onClick={queue.reload} className="self-start">
            Reintentar
          </Button>
        </div>
      )}

      {queue.status === 'success' && items.length === 0 && (
        <p className="text-muted">No hay devoluciones disputadas por ahora.</p>
      )}

      {queue.status === 'success' && items.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Devoluciones disputadas">
          {items.map((item) => (
            <li key={item.rowId}>
              <DisputeCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisputeCard({ item }: { item: DisputedRefund }) {
  return (
    <Card
      as="article"
      aria-label={`Devolución de ${item.memberName}`}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-ink">
          {item.groupName} · {formatPeriod(item.period)}
        </span>
        <Badge variant="warning">! Disputada</Badge>
      </div>
      <p className="text-sm text-muted">
        {item.memberName} disputa la devolución de {formatBs(item.refundAmountCents)} del titular{' '}
        {item.hostName}.
      </p>
      <p className="text-sm text-muted">
        {item.refundMethod
          ? `Registrada por ${METHOD_LABEL[item.refundMethod]}${item.refundReference ? ` · ref. ${item.refundReference}` : ''}`
          : 'El titular no registró la devolución.'}
      </p>
      <p className="text-sm">Motivo: {item.disputeReason}</p>
      <p className="text-sm text-muted">Disputada el {formatDateLaPaz(item.disputedAt)}</p>
    </Card>
  );
}
