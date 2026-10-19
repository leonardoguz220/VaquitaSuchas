'use client';

import Link from 'next/link';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useAdminDisputes } from '@/hooks/use-admin-disputes';
import { formatDateLaPaz } from '@/lib/dates';
import { adminDisputePath } from '@/lib/routes';
import type { AdminDispute } from '@/services/admin-disputes';
import { DISPUTE_RESULT_LABEL, DISPUTE_TYPE_LABEL } from './admin-dispute-labels';

/**
 * `/admin/reclamos` (plan 009 §6, RF-009-20): cola de reclamos de ingreso con los abiertos primero.
 * Cada fila dice el estado con texto e ícono, no solo con color (RNF-009-02).
 */
export function AdminDisputesView() {
  const queue = useAdminDisputes();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl tracking-tight">Reclamos</h1>

      {queue.status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando reclamos…
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

      {queue.status === 'success' && (queue.data?.items.length ?? 0) === 0 && (
        <p className="text-muted">No hay reclamos por ahora.</p>
      )}

      {queue.status === 'success' && (queue.data?.items.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Cola de reclamos">
          {queue.data?.items.map((item) => (
            <li key={item.id}>
              <DisputeRow dispute={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisputeRow({ dispute }: { dispute: AdminDispute }) {
  const open = dispute.status === 'abierto';
  return (
    <Link
      href={adminDisputePath(dispute.id)}
      className="block min-h-11 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Card className="flex flex-col gap-2 transition-colors hover:border-primary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-ink">{DISPUTE_TYPE_LABEL[dispute.type]}</span>
          {open ? (
            <Badge variant="warning">! Abierto</Badge>
          ) : (
            <Badge variant="neutral">
              ✓ Resuelto{dispute.result ? ` · ${DISPUTE_RESULT_LABEL[dispute.result]}` : ''}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted">
          {dispute.requesterName} contra {dispute.accusedName} · {dispute.groupName}
        </p>
        <p className="text-sm text-muted">{formatDateLaPaz(dispute.createdAt)}</p>
      </Card>
    </Link>
  );
}
