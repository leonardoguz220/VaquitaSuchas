'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { Badge, Button, Card, chargeStatusLabel, type ChargeStatus } from '@/components/ui';
import { useAdminStats } from '@/hooks/use-admin-stats';
import { formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { ADMIN_DISPUTES_PATH, ADMIN_MODERATION_PATH } from '@/lib/routes';
import type { AdminStats } from '@/services/admin-stats';
import { AdminLoadError } from './admin-states';

/** Orden de los estados de cobro en el tablero (RN-002-01). */
const STATUS_ORDER: ChargeStatus[] = [
  'pagado',
  'en_revision',
  'pendiente',
  'atrasado',
  'cancelado',
];

/** Clase de la barra de cada estado; el estado siempre va además con texto e ícono. */
const STATUS_BAR: Record<ChargeStatus, string> = {
  pagado: 'bg-status-pagado-fg',
  en_revision: 'bg-status-en-revision-fg',
  pendiente: 'bg-status-pendiente-fg',
  atrasado: 'bg-status-atrasado-fg',
  cancelado: 'bg-status-cancelado-fg',
};

/** Tasa de puntualidad (fracción de 0 a 1 que entrega la API) como porcentaje entero. */
export function punctualityText(rate: number | null): string {
  if (rate === null) return 'Sin datos';
  return `${Math.round(rate * 100)} %`;
}

function plural(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`;
}

function Tile({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="font-display text-3xl leading-tight font-bold">{value}</dd>
      {sub && <dd className="text-[15px] text-muted">{sub}</dd>}
      {action && <dd>{action}</dd>}
    </div>
  );
}

/**
 * Barra de una cantidad, proporcional al mayor valor de la lista (solo dibujo: el número va
 * escrito al lado). Con todo en cero no dibuja nada.
 */
function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span aria-hidden="true" className="block h-3 w-full rounded-full bg-bg">
      <span className={`block h-3 rounded-full ${className}`} style={{ width: `${width}%` }} />
    </span>
  );
}

/** Gráfico de barras en HTML con su tabla alternativa en un desplegable (RF-009-16). */
function BarSection({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: Array<{ key: string; label: ReactNode; text: string; value: number; barClass: string }>;
  columns: [string, string];
  empty: string;
}) {
  const titleId = useId();
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <>
          <ul aria-label={title} className="flex flex-col gap-3">
            {rows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
              >
                <span className="min-w-0">{row.label}</span>
                <span className="font-bold tabular-nums">{row.value}</span>
                <span className="col-span-2">
                  <Bar value={row.value} max={max} className={row.barClass} />
                </span>
              </li>
            ))}
          </ul>
          <details className="rounded-field border border-line p-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-bold">
              Ver tabla
            </summary>
            <table className="mt-2 w-full text-left">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line py-2 pr-3">
                    {columns[0]}
                  </th>
                  <th scope="col" className="border-b border-line py-2 text-right">
                    {columns[1]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="border-b border-line py-2 pr-3 font-normal">
                      {row.text}
                    </th>
                    <td className="border-b border-line py-2 text-right tabular-nums">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

function StatsContent({ stats }: { stats: AdminStats }) {
  const month = formatPeriod(stats.charges.period);
  const statusRows = STATUS_ORDER.map((status) => ({
    key: status,
    label: <Badge variant={status} />,
    text: chargeStatusLabel[status],
    value: stats.charges.byStatus[status] ?? 0,
    barClass: STATUS_BAR[status],
  }));
  const serviceRows = stats.topServices.map((service, index) => ({
    key: `${service.name}-${index}`,
    label: (
      <span className="font-bold break-words">
        {index + 1}. {service.name}
      </span>
    ),
    text: service.name,
    value: service.groups,
    barClass: 'bg-primary',
  }));

  return (
    <>
      <p className="text-muted">
        Datos agregados de {month}. Pueden tener hasta 5 minutos de retraso.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Usuarios"
          value={String(stats.users.total)}
          sub={`${plural(stats.users.newThisMonth, 'nuevo', 'nuevos')} este mes · ${plural(stats.users.active30d, 'activo', 'activos')} en 30 días`}
        />
        <Tile
          label="Grupos activos"
          value={String(stats.groups.active)}
          sub={`${plural(stats.groups.closed, 'cerrado', 'cerrados')}`}
        />
        <Tile label={`Monto gestionado en ${month}`} value={formatBs(stats.charges.managedCents)} />
        <Tile label="Puntualidad global" value={punctualityText(stats.punctualityRate)} />
        <Tile
          label="Publicaciones de cupos activas"
          value={String(stats.listings.active)}
          action={
            <Link href={ADMIN_MODERATION_PATH} className="inline-flex min-h-11 items-center">
              Ir a moderación
            </Link>
          }
        />
        <Tile label="Solicitudes de ingreso del mes" value={String(stats.joinRequestsThisMonth)} />
        <Tile
          label="Reclamos abiertos"
          value={String(stats.disputesOpen)}
          action={
            <Link href={ADMIN_DISPUTES_PATH} className="inline-flex min-h-11 items-center">
              Ver reclamos
            </Link>
          }
        />
      </dl>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <BarSection
          title={`Cobros de ${month} por estado`}
          rows={statusRows}
          columns={['Estado', 'Cobros']}
          empty="No hay cobros este mes."
        />
        <BarSection
          title="Servicios más compartidos"
          rows={serviceRows}
          columns={['Servicio', 'Grupos']}
          empty="Todavía no hay grupos con servicios del catálogo."
        />
      </div>
    </>
  );
}

function StatsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">Cargando estadísticas…</span>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-28 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/**
 * `/admin` (spec 009 T035, plan §6; mockup `AdminPanel.dc.html`): tablero con usuarios, grupos,
 * cobros del mes por estado, monto gestionado en Bs, puntualidad global, servicios más
 * compartidos, publicaciones activas, solicitudes del mes y reclamos abiertos (RF-009-15). Cada
 * gráfico tiene su tabla y los estados llevan texto e ícono, no solo color (RF-009-16). Solo
 * agregados que entrega la API (RF-009-17): el frontend no suma ni calcula.
 */
export function AdminStatsView() {
  const { status, data, error, reload } = useAdminStats();
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Tablero
        </h1>
        {status === 'success' && (
          <Button variant="secondary" onClick={reload} className="w-full sm:w-auto">
            Actualizar
          </Button>
        )}
      </div>
      {(status === 'loading' || status === 'redirecting') && <StatsSkeleton />}
      {status === 'error' && error && (
        <AdminLoadError
          error={error}
          title="No pudimos cargar las estadísticas."
          onRetry={reload}
        />
      )}
      {status === 'success' && data && <StatsContent stats={data} />}
    </>
  );
}
