'use client';

import dynamic from 'next/dynamic';
import { useId, useState, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useDashboardCharts, type DashboardFilters } from '@/hooks/use-dashboard';
import { formatPeriod } from '@/lib/dates';
import { formatBs, formatSignedBs } from '@/lib/money';
import type { DashboardCharts as ChartsData } from '@/services/reports';
import { DASHBOARD_MESSAGES, dashboardErrorMessage } from './dashboard-messages';

function ChartPlaceholder() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando el gráfico…</span>
      <div
        aria-hidden="true"
        className="h-72 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
    </div>
  );
}

// Recharts se carga aparte y solo en el navegador (plan 006 §2, decisión 10).
const loadCharts = () => import('./charts/dashboard-recharts');
const MonthlySpendChart = dynamic(() => loadCharts().then((mod) => mod.MonthlySpendChart), {
  ssr: false,
  loading: ChartPlaceholder,
});
const ServiceSpendChart = dynamic(() => loadCharts().then((mod) => mod.ServiceSpendChart), {
  ssr: false,
  loading: ChartPlaceholder,
});
const SavingsChart = dynamic(() => loadCharts().then((mod) => mod.SavingsChart), {
  ssr: false,
  loading: ChartPlaceholder,
});

/**
 * Tarjeta de un gráfico con su alternativa en tabla (RF-006-10): el botón «Ver tabla» con
 * `aria-pressed` cambia entre el gráfico y la tabla, que muestra los mismos valores.
 */
function ChartCard({
  title,
  description,
  chart,
  table,
  empty,
}: {
  title: string;
  description: string;
  chart: ReactNode;
  table: ReactNode;
  /** Texto si la serie no tiene datos; entonces no hay gráfico ni tabla. */
  empty: string | null;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={titleId} className="font-display text-lg font-bold">
            {title}
          </h3>
          <p id={descriptionId} className="text-[15px] text-muted">
            {description}
          </p>
        </div>
        {!empty && (
          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable(!showTable)}
            className={cx(
              'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              showTable
                ? 'border-ink bg-ink font-bold text-white'
                : 'border-field-border bg-surface text-ink hover:border-ink',
            )}
          >
            Ver tabla
          </button>
        )}
      </div>
      {empty ? <p className="text-muted">{empty}</p> : showTable ? table : chart}
    </section>
  );
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<{ key: string; cells: string[] }>;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-[15px] text-muted">
            {headers.map((header) => (
              <th key={header} scope="col" className="py-2 pr-3 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-0">
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="py-2 pr-3 font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="py-2 pr-3 font-bold whitespace-nowrap">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartsContent({ data, month }: { data: ChartsData; month: string }) {
  const monthName = formatPeriod(month);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard
          title="Tu gasto de los últimos 12 meses"
          description="Barras por mes: el gasto del mes y lo que ya está pagado."
          empty={data.monthly.length === 0 ? 'Todavía no hay meses con datos.' : null}
          chart={<MonthlySpendChart data={data.monthly} />}
          table={
            <DataTable
              caption="Gasto de los últimos 12 meses"
              headers={['Mes', 'Gasto', 'Pagado']}
              rows={data.monthly.map((item) => ({
                key: item.period,
                cells: [
                  formatPeriod(item.period),
                  formatBs(item.totalCents),
                  formatBs(item.paidCents),
                ],
              }))}
            />
          }
        />
      </div>
      <ChartCard
        title="Gasto por servicio"
        description={`Lo que gastas en cada servicio en ${monthName}.`}
        empty={data.byService.length === 0 ? `No hay gasto en ${monthName}.` : null}
        chart={<ServiceSpendChart data={data.byService} />}
        table={
          <DataTable
            caption={`Gasto por servicio en ${monthName}`}
            headers={['Servicio', 'Gasto']}
            rows={data.byService.map((item) => ({
              key: item.groupId,
              cells: [item.serviceName, formatBs(item.costCents)],
            }))}
          />
        }
      />
      <ChartCard
        title="Ahorro acumulado"
        description="Estimado frente al precio individual, sumado mes a mes."
        empty={data.savings.length === 0 ? 'Todavía no hay datos de ahorro.' : null}
        chart={<SavingsChart data={data.savings} />}
        table={
          <DataTable
            caption="Ahorro de los últimos 12 meses"
            headers={['Mes', 'Ahorro del mes', 'Acumulado']}
            rows={data.savings.map((item) => ({
              key: item.period,
              cells: [
                formatPeriod(item.period),
                item.savingsCents === null
                  ? DASHBOARD_MESSAGES.noData
                  : formatSignedBs(item.savingsCents),
                formatSignedBs(item.cumulativeCents),
              ],
            }))}
          />
        }
      />
    </div>
  );
}

/**
 * Sección **Gráficos** de `/panel` (spec 006 T018, plan §6): gasto de 12 meses, gasto por
 * servicio y ahorro acumulado, cada uno con «Ver tabla». Usa el mismo mes y suscripción que el
 * resto del panel. Cubre cargando, error, vacío y con datos.
 */
export function DashboardCharts({ filters, month }: { filters: DashboardFilters; month: string }) {
  const { status, data, error, reload } = useDashboardCharts(filters);
  return (
    <section aria-labelledby="charts-title" className="flex flex-col gap-3">
      <h2 id="charts-title" className="font-display text-xl font-bold">
        Gráficos
      </h2>
      {(status === 'loading' || status === 'redirecting') && <ChartPlaceholder />}
      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar los gráficos."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {dashboardErrorMessage(error)}
        </Alert>
      )}
      {status === 'success' && data && <ChartsContent data={data} month={month} />}
    </section>
  );
}
