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
 * filtros por acción, tipo de objeto y rango de fechas, y paginación. Cada acción es una tarjeta
 * (sin tabla ancha en celular); cada una dice la acción con texto, no solo con color (RNF-009-02).
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
          <ul
            aria-label="Acciones de administración, de la más reciente a la más antigua"
            className="flex flex-col gap-3"
          >
            {items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>

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
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-base">{AUDIT_ACTION_LABEL[entry.action]}</strong>
        <time dateTime={entry.occurredAt} className="text-muted">
          {formatDateTimeLaPaz(entry.occurredAt)}
        </time>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">Quién</dt>
        <dd title={entry.adminId}>Admin {entry.adminId.slice(0, 8)}</dd>
        <dt className="text-muted">Sobre</dt>
        <dd className="break-all">
          {AUDIT_TARGET_LABEL[entry.targetType]}
          {entry.targetId && <span className="block text-xs text-muted">{entry.targetId}</span>}
        </dd>
        <dt className="text-muted">Motivo</dt>
        <dd>{entry.reason ?? <span className="text-muted">Sin motivo</span>}</dd>
      </dl>
    </li>
  );
}
