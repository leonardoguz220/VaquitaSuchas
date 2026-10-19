'use client';

import { useState, type ReactNode } from 'react';
import { Card } from '@/components/ui';
import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { useBillingSummary } from '@/hooks/use-billing-summary';
import { formatPeriod } from '@/lib/dates';
import { emptyChargesMessage, SkeletonLines } from './group-charge-parts';
import { GroupChargesHistory } from './group-charges-history';
import { PeriodSelect, PeriodSummaryView } from './group-period-summary';

export interface GroupChargesTabProps {
  groupId: string;
  isOwner: boolean;
  /** Cola «Por revisar» del titular (T026); se muestra bajo los totales del mes. */
  reviewQueue?: ReactNode;
}

const HEADING_ID = 'group-charges-summary';

/**
 * Pestaña Cobros de `/grupos/[id]` (plan 002 §6, RF-002-16 a 18): selector de período, resumen
 * del mes e historial. Todo llega calculado de la API; un `404` del resumen es el estado vacío.
 */
export function GroupChargesTab({ groupId, isOwner, reviewQueue }: GroupChargesTabProps) {
  const [period, setPeriod] = useState<string | null>(null);
  const { state, retry } = useBillingSummary(groupId, period);

  if (state.status === 'empty' && period === null) {
    return (
      <Card as="section" aria-labelledby={HEADING_ID} className="flex flex-col gap-2">
        <h2 id={HEADING_ID} className="font-display text-2xl font-bold">
          Cobros
        </h2>
        <p className="text-muted">{emptyChargesMessage(isOwner)}</p>
      </Card>
    );
  }

  const shown =
    state.status === 'success' ? state.summary : state.status === 'loading' ? state.previous : null;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={HEADING_ID} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id={HEADING_ID} className="font-display text-2xl font-bold">
            {state.status === 'success'
              ? `Cobros de ${formatPeriod(state.summary.period).toLowerCase()}`
              : 'Cobros del mes'}
          </h2>
          {shown && shown.availablePeriods.length > 0 && (
            <PeriodSelect
              periods={shown.availablePeriods}
              value={period ?? shown.period}
              onChange={setPeriod}
              disabled={state.status === 'loading'}
            />
          )}
        </div>
        {state.status === 'loading' && <SkeletonLines label="Cargando los cobros del mes…" />}
        {state.status === 'redirecting' && (
          <p role="status" className="text-muted">
            Redirigiendo para iniciar sesión…
          </p>
        )}
        {state.status === 'error' && (
          <GroupLoadError error={state.error} what="los cobros del mes" onRetry={retry} />
        )}
        {state.status === 'empty' && <p className="text-muted">{emptyChargesMessage(isOwner)}</p>}
        {state.status === 'success' && (
          <PeriodSummaryView summary={state.summary} reviewQueue={isOwner ? reviewQueue : null} />
        )}
      </section>
      <GroupChargesHistory groupId={groupId} isOwner={isOwner} />
    </div>
  );
}
