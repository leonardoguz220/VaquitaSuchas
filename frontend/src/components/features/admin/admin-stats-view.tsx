'use client';

import { Alert, Button, Card } from '@/components/ui';
import { useAdminStats } from '@/hooks/use-admin-stats';
import { formatBs } from '@/lib/money';
import { formatPeriod } from '@/lib/dates';
import type { AdminChargeStatus, AdminStats } from '@/services/admin';
import { CHARGE_STATUS_LABEL } from './admin-labels';

/** Orden fijo de los estados de cobro: el mismo en la tabla y en las tarjetas (spec 002). */
const CHARGE_ORDER: AdminChargeStatus[] = [
  'pagado',
  'en_revision',
  'pendiente',
  'atrasado',
  'cancelado',
];

/**
 * `/admin` (plan 009 §6, RF-009-15 a RF-009-17, CA-009-16): tarjetas con las cifras principales y
 * tablas con el detalle. Las tablas son la alternativa para quien no distingue colores y para
 * lectores de pantalla (RNF-009-02). Solo muestra agregados que entrega la API.
 */
export function AdminStatsView() {
  const stats = useAdminStats();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl tracking-tight">Tablero</h1>

      {stats.status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando estadísticas…
        </p>
      )}

      {stats.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" title="No se pudieron cargar las estadísticas">
            {stats.error?.message}
          </Alert>
          <Button variant="secondary" onClick={stats.reload} className="self-start">
            Reintentar
          </Button>
        </div>
      )}

      {stats.status === 'success' && stats.data && <StatsContent stats={stats.data} />}
    </div>
  );
}

function StatsContent({ stats }: { stats: AdminStats }) {
  const tiles = [
    {
      label: 'Usuarios',
      value: stats.users.total,
      sub: `${stats.users.newThisMonth} nuevos este mes`,
    },
    { label: 'Grupos activos', value: stats.groups.active, sub: `${stats.groups.closed} cerrados` },
    {
      label: 'Solicitudes de ingreso',
      value: stats.joinRequestsThisMonth,
      sub: 'este mes',
    },
    { label: 'Reclamos abiertos', value: stats.disputesOpen, sub: 'por resolver' },
    { label: 'Cupos publicados', value: stats.listings.active, sub: 'publicaciones activas' },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Cifras principales">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Card className="flex h-full flex-col gap-1">
              <span className="text-sm text-muted">{tile.label}</span>
              <span className="font-display text-3xl font-bold">{tile.value}</span>
              <span className="text-sm text-muted">{tile.sub}</span>
            </Card>
          </li>
        ))}
      </ul>

      <section aria-labelledby="cobros" className="flex flex-col gap-3">
        <h2 id="cobros" className="text-xl font-bold">
          Cobros de {formatPeriod(stats.charges.period)} por estado
        </h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-72 border-collapse text-left">
            <thead>
              <tr className="text-sm text-muted">
                <th scope="col" className="px-4 py-3 font-bold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-right font-bold">
                  Cobros
                </th>
              </tr>
            </thead>
            <tbody>
              {CHARGE_ORDER.map((status) => (
                <tr key={status} className="border-t border-line">
                  <td className="px-4 py-3">{CHARGE_STATUS_LABEL[status]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {stats.charges.byStatus[status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-sm text-muted">
          Monto administrado:{' '}
          <strong className="text-ink">{formatBs(stats.charges.managedCents)}</strong>
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="puntualidad" className="flex flex-col gap-3">
          <h2 id="puntualidad" className="text-xl font-bold">
            Puntualidad
          </h2>
          <p className="text-sm text-muted">
            Cobros pagados a tiempo:{' '}
            <strong className="text-ink">{Math.round(stats.punctualityRate * 100)} %</strong>
          </p>
        </section>

        <section aria-labelledby="servicios" className="flex flex-col gap-3">
          <h2 id="servicios" className="text-xl font-bold">
            Servicios con más grupos
          </h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-64 border-collapse text-left">
              <thead>
                <tr className="text-sm text-muted">
                  <th scope="col" className="px-4 py-3 font-bold">
                    Servicio
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Grupos
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.topServices.map((service) => (
                  <tr key={service.name} className="border-t border-line">
                    <td className="px-4 py-3">{service.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{service.groups}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </div>
  );
}
