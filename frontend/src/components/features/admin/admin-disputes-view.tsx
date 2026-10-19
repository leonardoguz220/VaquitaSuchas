'use client';

import Link from 'next/link';
import {
  DISPUTE_KIND_LABEL,
  DISPUTE_RESULT_LABEL,
} from '@/components/features/join-requests/join-messages';
import { Alert, Badge, Button } from '@/components/ui';
import { useAdminDisputes } from '@/hooks/use-admin-disputes';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { adminDisputePath } from '@/lib/routes';
import type { AdminDisputeRow } from '@/services/admin-disputes';
import { adminLoadErrorMessage, DISPUTE_PARTY_LABEL } from './admin-messages';
import { AdminListSkeleton, AdminLoadError } from './admin-states';

/** Estado del reclamo con texto e ícono (no solo el color). */
export function DisputeStatusBadge({ status }: { status: AdminDisputeRow['status'] }) {
  return status === 'abierto' ? (
    <Badge variant="warning" icon="clock">
      Abierto
    </Badge>
  ) : (
    <Badge variant="neutral" icon="check">
      Resuelto
    </Badge>
  );
}

/** «Abrió Ana Quispe (solicitante) contra Kevin Rojas (titular)», como lo indica la API. */
export function disputePartiesText(dispute: AdminDisputeRow): string {
  return `Abrió ${dispute.openedBy.fullName} (${DISPUTE_PARTY_LABEL[dispute.openedBy.role]}) contra ${dispute.accused.fullName} (${DISPUTE_PARTY_LABEL[dispute.accused.role]})`;
}

function DisputeItem({ dispute }: { dispute: AdminDisputeRow }) {
  const kind = DISPUTE_KIND_LABEL[dispute.kind] ?? dispute.kind;
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={adminDisputePath(dispute.id)}
          className="inline-flex min-h-11 items-center font-bold break-words"
        >
          {kind} · {dispute.group.name}
        </Link>
        <DisputeStatusBadge status={dispute.status} />
      </div>
      <p className="break-words">{disputePartiesText(dispute)}</p>
      <p className="text-[15px] text-muted">
        {dispute.group.serviceName} · abierto el {formatDateTimeLaPaz(dispute.openedAt)} ·{' '}
        {dispute.hasResponse ? 'con respuesta' : 'sin respuesta'}
        {dispute.result && <> · resultado: {DISPUTE_RESULT_LABEL[dispute.result]}</>}
      </p>
    </article>
  );
}

/**
 * `/admin/reclamos` (spec 009 T024, plan §6; mockup `AdminReclamo.dc.html`): cola de reclamos de
 * ingreso con los abiertos primero (el orden lo entrega la API, RF-009-20), con tipo, partes,
 * fechas y si hubo respuesta. La cola no muestra chat ni comprobante.
 */
export function AdminDisputesView() {
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useAdminDisputes();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Reclamos
        </h1>
        <p className="text-muted">
          Reclamos de ingreso por pago sin ingreso o comprobante falso. Los abiertos van primero.
        </p>
      </div>

      {(status === 'loading' || status === 'redirecting') && (
        <AdminListSkeleton label="Cargando reclamos…" />
      )}
      {status === 'error' && error && (
        <AdminLoadError error={error} title="No pudimos cargar los reclamos." onRetry={reload} />
      )}
      {status === 'success' && items.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-5">
          No hay reclamos. Cuando alguien abra uno, aparecerá aquí.
        </p>
      )}
      {status === 'success' && items.length > 0 && (
        <>
          <ul aria-label="Reclamos" className="flex flex-col gap-3">
            {items.map((dispute) => (
              <li key={dispute.id}>
                <DisputeItem dispute={dispute} />
              </li>
            ))}
          </ul>
          {loadMoreError && <Alert variant="error">{adminLoadErrorMessage(loadMoreError)}</Alert>}
          {hasMore && (
            <Button
              variant="secondary"
              onClick={() => void loadMore()}
              loading={isLoadingMore}
              className="w-full sm:w-auto sm:self-center"
            >
              Cargar más
            </Button>
          )}
        </>
      )}
    </>
  );
}
