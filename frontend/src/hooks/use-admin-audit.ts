'use client';

import { useCallback, useState } from 'react';
import {
  listAuditLog,
  type AuditAction,
  type AuditTargetType,
  type ListAuditLogParams,
} from '@/services/admin-audit';
import { useApiResource } from './use-api-resource';

/** Filtros de la pantalla; cadena vacía = sin filtrar. */
export interface AuditFilters {
  action: AuditAction | '';
  targetType: AuditTargetType | '';
  from: string;
  to: string;
}

export const NO_AUDIT_FILTERS: AuditFilters = { action: '', targetType: '', from: '', to: '' };

/**
 * Log de auditoría con filtros y paginación (`GET /admin/audit-log`, RF-009-18). Cambiar un filtro
 * vuelve a la primera página. Los cursores de las páginas vistas se guardan para poder volver.
 */
export function useAdminAudit() {
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  // cursors[i] es el cursor que pidió la página i; la primera no lleva cursor.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const cursor = cursors[page];

  const load = useCallback(() => {
    const params: ListAuditLogParams = {
      action: filters.action || undefined,
      targetType: filters.targetType || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      cursor,
    };
    return listAuditLog(params);
  }, [filters, cursor]);

  const resource = useApiResource(load);
  const nextCursor = resource.data?.nextCursor ?? null;

  const updateFilters = useCallback((patch: Partial<AuditFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setCursors([undefined]);
    setPage(0);
  }, []);

  const next = useCallback(() => {
    if (nextCursor === null) return;
    setCursors((current) => [...current.slice(0, page + 1), nextCursor]);
    setPage((current) => current + 1);
  }, [nextCursor, page]);

  const previous = useCallback(() => {
    setPage((current) => Math.max(0, current - 1));
  }, []);

  return {
    resource,
    filters,
    updateFilters,
    page,
    hasNext: nextCursor !== null,
    hasPrevious: page > 0,
    next,
    previous,
  };
}
