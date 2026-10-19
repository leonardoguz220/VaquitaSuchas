'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { useAuditLog, type AuditFilters } from '@/hooks/use-admin-audit';
import { useAdminAccounts } from '@/hooks/use-admin-users';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { adminUserPath } from '@/lib/routes';
import type { AuditAction, AuditEntry, AuditTargetType } from '@/services/admin-audit';
import { adminLoadErrorMessage, AUDIT_ACTION_LABEL, AUDIT_TARGET_LABEL } from './admin-messages';
import { AdminListSkeleton, AdminLoadError } from './admin-states';

const ACTIONS = Object.entries(AUDIT_ACTION_LABEL) as Array<[AuditAction, string]>;
const TARGETS = Object.entries(AUDIT_TARGET_LABEL) as Array<[AuditTargetType, string]>;

/** Celda que en el celular se apila con su rótulo (tarjeta) y en pantalla ancha es una columna. */
const CELL =
  'flex flex-col gap-0.5 py-1 sm:table-cell sm:border-b sm:border-line sm:px-3 sm:py-3 sm:align-top ' +
  'before:text-[13px] before:text-muted before:content-[attr(data-label)] sm:before:content-none';

function TargetCell({ entry }: { entry: AuditEntry }) {
  const kind = AUDIT_TARGET_LABEL[entry.targetType] ?? entry.targetType;
  const text = entry.targetLabel ? `${kind} · ${entry.targetLabel}` : kind;
  if (entry.targetType === 'user' && entry.targetId) {
    return (
      <Link href={adminUserPath(entry.targetId)} className="break-words">
        {text}
      </Link>
    );
  }
  return <span className="break-words">{text}</span>;
}

/**
 * `/admin/auditoria` (spec 009 T024, plan §6; mockup `AdminAuditoria.dc.html`): registro de las
 * acciones de administración con quién, qué, sobre qué, motivo y fecha en La Paz (RF-009-18,
 * CA-009-18), filtros por acción, administrador, objetivo y fechas, y «Cargar más». Es de solo
 * anexado: la pantalla no ofrece editar ni borrar (CA-009-19). En el celular cada fila es una
 * tarjeta con sus rótulos.
 */
export function AdminAuditView() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const admins = useAdminAccounts();
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useAuditLog(filters);
  const filtered = Object.values(filters).some(Boolean);

  function update<K extends keyof AuditFilters>(key: K, value: string) {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Auditoría
        </h1>
        <p className="text-muted">Registro de solo anexado: no se edita ni se borra.</p>
      </div>

      <section aria-label="Filtros" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Acción"
          value={filters.action ?? ''}
          onChange={(event) => update('action', event.target.value)}
        >
          <option value="">Todas las acciones</option>
          {ACTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          label="Administrador"
          value={filters.adminId ?? ''}
          onChange={(event) => update('adminId', event.target.value)}
        >
          <option value="">Todos los administradores</option>
          {(admins.data?.items ?? []).map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.fullName}
            </option>
          ))}
        </Select>
        <Select
          label="Sobre"
          value={filters.targetType ?? ''}
          onChange={(event) => update('targetType', event.target.value)}
        >
          <option value="">Todo</option>
          {TARGETS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Field
          label="Desde"
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(event) => update('from', event.target.value)}
        />
        <Field
          label="Hasta"
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(event) => update('to', event.target.value)}
        />
      </section>

      {(status === 'loading' || status === 'redirecting') && (
        <AdminListSkeleton label="Cargando auditoría…" />
      )}
      {status === 'error' && error && (
        <AdminLoadError error={error} title="No pudimos cargar la auditoría." onRetry={reload} />
      )}
      {status === 'success' && items.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <p className="font-bold">
            {filtered
              ? 'No hay acciones con esos filtros.'
              : 'Todavía no hay acciones registradas.'}
          </p>
          {filtered && (
            <Button
              variant="secondary"
              onClick={() => setFilters({})}
              className="w-full sm:w-auto sm:self-start"
            >
              Quitar filtros
            </Button>
          )}
        </div>
      )}
      {status === 'success' && items.length > 0 && (
        <>
          <div className="rounded-card border border-line bg-surface sm:overflow-x-auto">
            <table className="block w-full text-left sm:table">
              <caption className="sr-only">Acciones de administración</caption>
              <thead className="sr-only sm:not-sr-only sm:table-header-group">
                <tr>
                  {['Fecha', 'Administrador', 'Acción', 'Sobre', 'Motivo'].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className="border-b border-line px-3 py-3 text-[15px] font-bold text-muted"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="block border-b border-line p-4 last:border-b-0 sm:table-row sm:p-0"
                  >
                    <td data-label="Fecha" className={CELL}>
                      <time dateTime={entry.occurredAt}>
                        {formatDateTimeLaPaz(entry.occurredAt)}
                      </time>
                    </td>
                    <td data-label="Administrador" className={CELL}>
                      {entry.admin.fullName}
                    </td>
                    <td data-label="Acción" className={`${CELL} font-bold`}>
                      {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                    </td>
                    <td data-label="Sobre" className={CELL}>
                      <TargetCell entry={entry} />
                    </td>
                    <td data-label="Motivo" className={`${CELL} break-words`}>
                      {entry.reason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
