'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Select } from '@/components/ui';
import { useGroupCollection } from '@/hooks/use-dashboard';
import { formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath } from '@/lib/routes';
import type { ApiError } from '@/services/http';
import type { GroupCollection } from '@/services/reports';
import { CollectionCard } from './collection-card';
import { dashboardErrorMessage } from './dashboard-messages';

function collectionErrorText(error: ApiError): string {
  if (error.statusCode === 403) return 'Solo el titular del grupo ve la cobranza.';
  if (error.statusCode === 404) return 'No encontramos la cobranza de este grupo para ese mes.';
  return dashboardErrorMessage(error);
}

/** Opciones del mes: las de la API y, si no está entre ellas, el mes mostrado. */
function periodOptions(data: GroupCollection | null, period: string | null): string[] {
  if (!data) return period ? [period] : [];
  return data.availablePeriods.includes(data.period)
    ? data.availablePeriods
    : [data.period, ...data.availablePeriods];
}

/** Tabla por miembro con filtro por miembro (solo muestra u oculta filas de la API). */
function MembersTable({ data }: { data: GroupCollection }) {
  const [userId, setUserId] = useState('');
  const rows = userId ? data.members.filter((member) => member.userId === userId) : data.members;

  if (data.members.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-muted">
        No hay cobros de miembros en {formatPeriod(data.period)}.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="collection-members-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 id="collection-members-title" className="font-display text-lg font-bold">
          Cobros por miembro
        </h3>
        <div className="sm:w-64">
          <Select
            label="Miembro"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Todos los miembros</option>
            {data.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[20rem] text-left">
          <caption className="sr-only">Cobros por miembro de {formatPeriod(data.period)}</caption>
          <thead>
            <tr className="border-b border-line text-[15px] text-muted">
              <th scope="col" className="py-2 pr-3 font-bold">
                Miembro
              </th>
              <th scope="col" className="py-2 pr-3 font-bold">
                Monto
              </th>
              <th scope="col" className="py-2 pr-3 font-bold">
                Estado
              </th>
              <th scope="col" className="py-2 font-bold">
                <span className="sr-only">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr key={member.chargeId} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {member.fullName}
                </th>
                <td className="py-2 pr-3 font-bold whitespace-nowrap">
                  {formatBs(member.amountCents)}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={member.status} />
                </td>
                <td className="py-2">
                  <Link
                    href={chargePath(member.chargeId)}
                    aria-label={`Ver el cobro de ${member.fullName}`}
                    className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Ver cobro
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Pestaña **Cobranza** de `/grupos/[id]` para el titular (spec 006 T014, plan §6): selector de
 * mes con los períodos de la API, resumen (esperado, cobrado, pendiente, porcentaje en texto y
 * atrasados) y tabla por miembro con filtro. Cubre cargando, error y con datos.
 */
export function GroupCollectionTab({ groupId }: { groupId: string }) {
  const [period, setPeriod] = useState<string | null>(null);
  const { status, data, error, reload } = useGroupCollection(groupId, period);
  const periods = periodOptions(data, period);

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:w-64">
        <Select
          label="Mes"
          value={period ?? data?.period ?? ''}
          disabled={periods.length === 0}
          onChange={(event) => setPeriod(event.target.value || null)}
        >
          {periods.length === 0 && <option value="">Mes actual</option>}
          {periods.map((value) => (
            <option key={value} value={value}>
              {formatPeriod(value)}
            </option>
          ))}
        </Select>
      </div>

      {(status === 'loading' || status === 'redirecting') && (
        <div role="status" aria-busy="true">
          <span className="sr-only">Cargando la cobranza…</span>
          <div
            aria-hidden="true"
            className="h-40 animate-pulse rounded-card bg-line motion-reduce:animate-none"
          />
        </div>
      )}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar la cobranza."
          action={
            error.statusCode === 403 || error.statusCode === 404 ? undefined : (
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            )
          }
        >
          {collectionErrorText(error)}
        </Alert>
      )}

      {status === 'success' && data && (
        <>
          <CollectionCard summary={data} showPeriod={false} />
          <MembersTable key={data.period} data={data} />
        </>
      )}
    </div>
  );
}
