'use client';

import Link from 'next/link';
import { Alert, Button } from '@/components/ui';
import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { useGroupCharges } from '@/hooks/use-group-charges';
import { formatPeriod } from '@/lib/dates';
import { chargePath } from './charge-labels';
import { TimelineList } from './charge-timeline';
import { ChargeRowContent, emptyChargesMessage, SkeletonLines } from './group-charge-parts';

const HEADING_ID = 'group-charges-history';

/**
 * Historial del grupo (RF-002-17, CA-002-18): cada cobro con su línea de tiempo pública, sin
 * comprobantes ni referencias. El titular puede abrir cada cobro en `/cobros/[id]`.
 */
export function GroupChargesHistory({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const { state, retry, loadMore } = useGroupCharges(groupId);

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <h2 id={HEADING_ID} className="font-display text-2xl font-bold">
        Historial
      </h2>
      {state.status === 'loading' && <SkeletonLines label="Cargando el historial…" />}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="el historial de cobros" onRetry={retry} />
      )}
      {state.status === 'success' && state.items.length === 0 && (
        <p className="text-muted">{emptyChargesMessage(isOwner)}</p>
      )}
      {state.status === 'success' && state.items.length > 0 && (
        <>
          <ul aria-label="Historial de cobros" className="flex flex-col gap-3">
            {state.items.map((charge) => (
              <li
                key={charge.id}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
              >
                <span className="text-[15px] text-muted">{formatPeriod(charge.period)}</span>
                <ChargeRowContent charge={charge} isFormerMember={charge.member.isFormerMember} />
                {charge.timeline.length > 0 && (
                  <TimelineList
                    events={charge.timeline}
                    label={`Línea de tiempo del cobro de ${charge.member.fullName}`}
                  />
                )}
                {isOwner && (
                  <Link
                    href={chargePath(charge.id)}
                    className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    Ver cobro
                    <span className="sr-only">{` de ${charge.member.fullName}`}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {state.moreError && (
            <Alert
              variant="error"
              title="No pudimos cargar más cobros."
              action={
                <Button variant="secondary" onClick={loadMore} className="w-full sm:w-auto">
                  Reintentar
                </Button>
              }
            >
              Vuelve a intentarlo en unos segundos.
            </Alert>
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
    </section>
  );
}
