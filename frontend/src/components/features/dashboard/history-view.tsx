'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Alert, Badge, Button, chargeStatusLabel, Field, Select } from '@/components/ui';
import { useGroups } from '@/hooks/use-groups';
import { useHistory } from '@/hooks/use-dashboard';
import { formatCalendarDayLaPaz, formatDateLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { PANEL_PATH } from '@/lib/routes';
import { chargePath } from '@/components/features/charges/charge-labels';
import { exportHistoryCsv, type HistoryItem, type HistoryStatus } from '@/services/reports';
import { dashboardErrorMessage } from './dashboard-messages';
import { ExportCsvButton } from './export-csv-button';

const PERIOD_INPUT = /^\d{4}-(0[1-9]|1[0-2])$/;

const STATUSES = Object.keys(chargeStatusLabel) as HistoryStatus[];

function HistorySkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando tu historial…</span>
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-card bg-line motion-reduce:animate-none"
      />
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="py-3 pr-3 font-normal whitespace-nowrap">
        {formatPeriod(item.period)}
      </th>
      <td className="py-3 pr-3">
        <Link
          href={chargePath(item.chargeId)}
          className="inline-flex min-h-11 flex-col justify-center font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {item.groupName}
          <span className="text-[15px] font-normal text-muted">
            {item.serviceName}
            {item.origin === 'ingreso' ? ' · Pago de ingreso' : ''}
          </span>
        </Link>
      </td>
      <td className="py-3 pr-3 font-bold whitespace-nowrap">{formatBs(item.amountCents)}</td>
      <td className="py-3 pr-3">
        <Badge variant={item.status} />
      </td>
      <td className="py-3 pr-3 whitespace-nowrap">{formatCalendarDayLaPaz(item.dueDate)}</td>
      <td className="py-3 whitespace-nowrap">
        {item.paidAt ? (
          formatDateLaPaz(item.paidAt)
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Sin pago</span>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * `/panel/historial` (spec 006 T026, plan §6; mockup `Historial.dc.html`): todos los cobros
 * propios, también cancelados y de grupos que dejó, con filtros de mes, suscripción y estado
 * aplicados por la API, «Cargar más» y **Exportar CSV** con los mismos filtros. Cubre cargando,
 * vacío, error y con datos.
 */
export function HistoryView() {
  const [periodInput, setPeriodInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<HistoryStatus | ''>('');
  const period = PERIOD_INPUT.test(periodInput) ? periodInput : '';
  const filters = {
    ...(period ? { period } : {}),
    ...(groupId ? { groupId } : {}),
    ...(status ? { status } : {}),
  };
  const history = useHistory(filters);
  const groups = useGroups();
  const filtered = Boolean(period || groupId || status);

  const exportRequest = useCallback(
    () =>
      exportHistoryCsv({
        ...(period ? { period } : {}),
        ...(groupId ? { groupId } : {}),
        ...(status ? { status } : {}),
      }),
    [period, groupId, status],
  );

  return (
    <>
      <Link
        href={PANEL_PATH}
        className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">←</span> Volver al panel
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            Historial
          </h1>
          <p className="text-muted">
            Todos tus cobros, también los cancelados y los de grupos que dejaste.
          </p>
        </div>
        <ExportCsvButton
          label="Exportar CSV"
          request={exportRequest}
          fallbackName="vaquita-historial.csv"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          type="month"
          label="Mes"
          hint="Déjalo vacío para ver todos."
          value={periodInput}
          onChange={(event) => setPeriodInput(event.target.value)}
        />
        <Select
          label="Suscripción"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          <option value="">Todas las suscripciones</option>
          {(groups.state.status === 'success' ? groups.state.items : []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
        <Select
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as HistoryStatus | '')}
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {chargeStatusLabel[value]}
            </option>
          ))}
        </Select>
      </div>

      {(history.status === 'loading' || history.status === 'redirecting') && <HistorySkeleton />}

      {history.status === 'error' && history.error && (
        <Alert
          variant="error"
          title="No pudimos cargar tu historial."
          action={
            <Button variant="secondary" onClick={history.reload}>
              Reintentar
            </Button>
          }
        >
          {dashboardErrorMessage(history.error)}
        </Alert>
      )}

      {history.status === 'success' && history.items.length === 0 && (
        <section
          aria-labelledby="history-empty-title"
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="history-empty-title" className="font-display text-xl font-bold">
            {filtered ? 'No hay cobros con estos filtros' : 'Aún no tienes cobros'}
          </h2>
          <p className="text-muted">
            {filtered
              ? 'Prueba con otro mes, suscripción o estado.'
              : 'Cuando tengas cobros en tus grupos, aparecerán aquí.'}
          </p>
        </section>
      )}

      {history.status === 'success' && history.items.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:rounded-card sm:border sm:border-line sm:bg-surface sm:px-5">
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Tu historial de cobros</caption>
            <thead>
              <tr className="border-b border-line text-[15px] text-muted">
                {['Período', 'Suscripción', 'Monto', 'Estado', 'Vence', 'Pagado el'].map(
                  (header) => (
                    <th key={header} scope="col" className="py-3 pr-3 font-bold">
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {history.items.map((item) => (
                <HistoryRow key={item.chargeId} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.status === 'success' && history.loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más cobros.">
          {dashboardErrorMessage(history.loadMoreError)}
        </Alert>
      )}

      {history.status === 'success' && history.hasMore && (
        <Button
          variant="secondary"
          onClick={() => void history.loadMore()}
          loading={history.isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Cargar más
        </Button>
      )}
    </>
  );
}
