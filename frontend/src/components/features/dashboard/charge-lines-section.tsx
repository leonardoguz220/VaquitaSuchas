'use client';

import { useId } from 'react';
import { Alert, Badge, Button } from '@/components/ui';
import { useDashboardList } from '@/hooks/use-dashboard';
import { formatCalendarDate, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath, safeInternalLink } from '@/lib/routes';
import type { ChargeLine, DashboardListName } from '@/services/reports';
import { DASHBOARD_MESSAGES, dashboardErrorMessage } from './dashboard-messages';

interface SectionCopy {
  title: string;
  note?: string;
  empty: string;
  loading: string;
  error: string;
  action: (line: ChargeLine) => string;
}

const COPY: Record<DashboardListName, SectionCopy> = {
  debts: {
    title: 'Lo que debes',
    note: DASHBOARD_MESSAGES.debtsScope,
    empty: 'No tienes cobros pendientes ni atrasados.',
    loading: 'Cargando lo que debes…',
    error: 'No pudimos cargar lo que debes.',
    action: () => 'Subir comprobante',
  },
  in_review: {
    title: 'En revisión',
    note: DASHBOARD_MESSAGES.inReviewNote,
    empty: 'No tienes comprobantes en revisión.',
    loading: 'Cargando tus cobros en revisión…',
    error: 'No pudimos cargar tus cobros en revisión.',
    action: () => 'Ver cobro',
  },
  owed: {
    title: 'Lo que te deben',
    note: 'Cobros pendientes, atrasados o en revisión de los miembros de tus grupos.',
    empty: 'Nadie te debe por ahora.',
    loading: 'Cargando lo que te deben…',
    error: 'No pudimos cargar lo que te deben.',
    action: (line) => (line.status === 'en_revision' ? 'Revisar comprobante' : 'Ver cobro'),
  },
};

function LineItem({ line, copy }: { line: ChargeLine; copy: SectionCopy }) {
  const href = safeInternalLink(line.link) ?? chargePath(line.chargeId);
  const action = copy.action(line);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-bold">{line.groupName}</span>
        {line.memberName && <span className="text-[15px] text-ink">{line.memberName}</span>}
        <span className="text-[15px] text-muted">
          {line.serviceName} · {formatPeriod(line.period)} · vence el{' '}
          {formatCalendarDate(line.dueDate)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-xl font-bold">{formatBs(line.amountCents)}</span>
        <Badge variant={line.status} />
        <Button
          href={href}
          variant={
            line.status === 'en_revision' && action === 'Ver cobro' ? 'secondary' : 'primary'
          }
          aria-label={`${action}: ${line.groupName}, ${formatPeriod(line.period)}`}
        >
          {action}
        </Button>
      </div>
    </li>
  );
}

/**
 * Lista «Lo que debes», «En revisión» o «Te deben» del panel (RF-006-04, RF-006-05): cada cobro
 * con su grupo, período, vencimiento, monto y estado con texto, y el acceso a su detalle para
 * subir el comprobante o revisarlo. Cubre cargando, vacío, error y con datos.
 */
export function ChargeLinesSection({ list }: { list: DashboardListName }) {
  const copy = COPY[list];
  const titleId = useId();
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useDashboardList(list);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="font-display text-xl font-bold">
          {copy.title}
        </h2>
        {copy.note && <p className="text-[15px] text-muted">{copy.note}</p>}
      </div>

      {(status === 'loading' || status === 'redirecting') && (
        <p role="status" className="rounded-card border border-line bg-surface p-4 text-muted">
          {copy.loading}
        </p>
      )}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={copy.error}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {dashboardErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-4 text-muted">{copy.empty}</p>
      )}

      {status === 'success' && items.length > 0 && (
        <ul aria-label={copy.title} className="flex flex-col gap-3">
          {items.map((line) => (
            <LineItem key={line.chargeId} line={line} copy={copy} />
          ))}
        </ul>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más cobros.">
          {dashboardErrorMessage(loadMoreError)}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-start"
        >
          Ver más
        </Button>
      )}
    </section>
  );
}
