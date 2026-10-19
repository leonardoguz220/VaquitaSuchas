'use client';

import Link from 'next/link';
import { Alert, Button, Card } from '@/components/ui';
import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { useGroupCharges, type GroupChargeItem } from '@/hooks/use-group-charges';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { ChargeStatus } from '@/services/charges';
import { chargePath } from './charge-labels';
import { SkeletonLines } from './group-charge-parts';

const HEADING_ID = 'group-review-queue';
const IN_REVIEW: readonly ChargeStatus[] = ['en_revision'];

/** Fecha del comprobante vigente que trae la API (el titular recibe `Charge` completo). */
function submittedAt(charge: GroupChargeItem): string | null {
  if (!('currentReceipt' in charge)) return null;
  return charge.currentReceipt?.uploadedAt ?? charge.firstSubmittedAt;
}

/**
 * Cola «Por revisar» del titular en la pestaña Cobros (plan 002 §6, mockup `Grupo.dc.html`): los
 * cobros `en_revision` que filtra el servidor, con miembro, monto, fecha de envío y enlace.
 */
export function ReviewQueue({ groupId }: { groupId: string }) {
  const { state, retry, loadMore } = useGroupCharges(groupId, IN_REVIEW);

  return (
    <Card as="section" aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <h3 id={HEADING_ID} className="font-display text-xl font-bold">
        Por revisar
      </h3>
      {state.status === 'loading' && (
        <SkeletonLines label="Cargando los comprobantes por revisar…" rows={2} />
      )}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="los comprobantes por revisar" onRetry={retry} />
      )}
      {state.status === 'success' && state.items.length === 0 && (
        <p className="text-muted">No hay comprobantes por revisar</p>
      )}
      {state.status === 'success' && state.items.length > 0 && (
        <>
          <ul aria-label="Comprobantes por revisar" className="flex flex-col divide-y divide-line">
            {state.items.map((charge) => {
              const sent = submittedAt(charge);
              return (
                <li
                  key={charge.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold break-words">{charge.member.fullName}</span>
                    <span className="text-[15px] text-muted">
                      <span className="font-bold text-ink tabular-nums">
                        {formatBs(charge.amountCents)}
                      </span>
                      {sent ? ` · Enviado el ${formatDateTimeLaPaz(sent)}` : ''}
                    </span>
                  </div>
                  <Link
                    href={chargePath(charge.id)}
                    className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:self-center"
                  >
                    Revisar comprobante
                    <span className="sr-only">{` de ${charge.member.fullName}`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {state.moreError && (
            <Alert
              variant="error"
              title="No pudimos cargar más comprobantes."
              action={
                <Button variant="secondary" onClick={loadMore} className="w-full sm:w-auto">
                  Reintentar
                </Button>
              }
            />
          )}
          {state.nextCursor && !state.moreError && (
            <Button
              variant="secondary"
              onClick={loadMore}
              loading={state.loadingMore}
              className="w-full sm:w-auto sm:self-start"
            >
              Cargar más
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
