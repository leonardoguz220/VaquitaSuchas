'use client';

import { useCallback } from 'react';
import { listAuditLog, type ListAuditLogParams } from '@/services/admin-audit';
import { usePaginatedResource } from './use-paginated-resource';

/** Entradas por página de `/admin/auditoria`. */
export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = Pick<
  ListAuditLogParams,
  'adminId' | 'action' | 'targetType' | 'from' | 'to'
>;

/** Log de auditoría (`GET /admin/audit-log`, RF-009-18) con filtros y «Cargar más». */
export function useAuditLog({ adminId, action, targetType, from, to }: AuditFilters) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listAuditLog({
        ...(adminId ? { adminId } : {}),
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit: AUDIT_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [adminId, action, targetType, from, to],
  );
  return usePaginatedResource(loadPage);
}
