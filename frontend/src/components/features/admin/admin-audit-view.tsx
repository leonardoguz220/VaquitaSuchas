'use client';

import { Alert, Button, Select } from '@/components/ui';
import { useAdminAudit } from '@/hooks/use-admin-audit';
import { formatDateTimeLaPaz } from '@/lib/dates';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditEntry,
  type AuditTargetType,
} from '@/services/admin-audit';
import { AUDIT_ACTION_LABEL, AUDIT_TARGET_LABEL } from './admin-audit-labels';

const INPUT =
  'min-h-11 rounded-field border border-field-border bg-surface px-3 text-base text-ink';

/**
 * `/admin/auditoria` (spec 009 T024, plan §6, RF-009-18): tabla del log de solo lectura con
 * filtros por acción, tipo de objeto y rango de fechas, y paginación. La tabla se desplaza en
 * horizontal en celular; cada fila dice la acción con texto, no solo con color (RNF-009-02).
 */
export function AdminAuditView() {
  const audit = useAdminAudit();
  const { resource, filters } = audit;
  const items = resource.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">Auditoría</h1>
        <p className="text-muted">
          Cada acción de administración queda registrada aquí. El registro no se puede editar ni
          borrar.
        </p>
      </div>

      <form
        aria-label="Filtros de auditoría"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <Select
          label="Acción"
          value={filters.action}
          onChange={(event) =>
            audit.updateFilters({ action: event.target.value as AuditAction | '' })
          }
        >
          <option value="">Todas</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABEL[action]}
            </option>
          ))}
        </Select>

        <Select
          label="Sobre"
          value={filters.targetType}
          onChange={(event) =>
            audit.updateFilters({ targetType: event.target.value as AuditTargetType | '' })
          }
        >
          <option value="">Todos</option>
          {AUDIT_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {AUDIT_TARGET_LABEL[type]}
            </option>
          ))}
        </Select>

        <label className="flex flex-col gap-1.5">
          <span className="font-bold">Desde</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => audit.updateFilters({ from: event.target.value })}
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-bold">Hasta</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => audit.updateFilters({ to: event.target.value })}
            className={INPUT}
          />
        </label>
      </form>

      {resource.status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando auditoría…
        </p>
      )}

      {resource.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" title="No se pudo cargar el registro">
            {resource.error?.message}
          </Alert>
          <Button variant="secondary" onClick={resource.reload} className="self-start">
            Reintentar
          </Button>
        </div>
      )}

      {resource.status === 'success' && items.length === 0 && (
        <p role="status" className="text-muted">
          No hay acciones con esos filtros.
        </p>
      )}

      {resource.status === 'success' && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Acciones de administración, de la más reciente a la más antigua
              </caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3 font-bold">
                    Cuándo
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    Quién
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    Acción
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    Sobre
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={audit.previous} disabled={!audit.hasPrevious}>
              Anterior
            </Button>
            <span className="text-sm text-muted">Página {audit.page + 1}</span>
            <Button variant="secondary" onClick={audit.next} disabled={!audit.hasNext}>
              Siguiente
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-3 whitespace-nowrap">
        <time dateTime={entry.occurredAt}>{formatDateTimeLaPaz(entry.occurredAt)}</time>
      </td>
      <td className="px-3 py-3">
        <span title={entry.adminId}>Admin {entry.adminId.slice(0, 8)}</span>
      </td>
      <td className="px-3 py-3 font-bold">{AUDIT_ACTION_LABEL[entry.action]}</td>
      <td className="px-3 py-3">
        {AUDIT_TARGET_LABEL[entry.targetType]}
        {entry.targetId && <span className="block text-xs text-muted">{entry.targetId}</span>}
      </td>
      <td className="px-3 py-3">
        {entry.reason ?? <span className="text-muted">Sin motivo</span>}
      </td>
    </tr>
  );
}
