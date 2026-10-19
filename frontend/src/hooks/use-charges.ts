'use client';

import { useCallback } from 'react';
import {
  confirmCharge,
  getCharge,
  getReceiptFile,
  listGroupCharges,
  listMyCharges,
  rejectCharge,
  uploadReceipt,
  type ChargeStatus,
  type ListGroupChargesParams,
  type RejectChargeRequest,
  type UploadReceiptRequest,
} from '@/services/charges';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Cobros por página de "Mis cobros" (contrato 000 A: `limit` de 1 a 100). */
export const MY_CHARGES_PAGE_SIZE = 20;

export interface MyChargesFilters {
  status: ChargeStatus | null;
  /** `YYYY-MM` o `null` para todos los períodos. */
  period: string | null;
}

/**
 * "Mis cobros" (`GET /me/charges`, RF-002-15): los filtros por estado y período los aplica la
 * API; "Ver más" sigue el cursor. Si cambia un filtro, se vuelve a la primera página.
 */
export function useMyCharges({ status, period }: MyChargesFilters) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listMyCharges({
        ...(status ? { status } : {}),
        ...(period ? { period } : {}),
        limit: MY_CHARGES_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [status, period],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Detalle de un cobro (`GET /charges/:id`). `403` (cobro de otro miembro) y `404` (ajeno,
 * CA-002-23) llegan en `error`.
 */
export function useCharge(chargeId: string) {
  const load = useCallback(() => getCharge(chargeId), [chargeId]);
  return useApiResource(load);
}

/** Subir o reemplazar el comprobante (`POST /charges/:id/receipts`, RF-002-06 y RF-002-08). */
export function useUploadReceipt(chargeId: string) {
  const request = useCallback(
    (input: UploadReceiptRequest) => uploadReceipt(chargeId, input),
    [chargeId],
  );
  return useApiSubmit(request);
}

/** Confirmar un pago como titular (`POST /charges/:id/confirm`, RF-002-10). */
export function useConfirmCharge(chargeId: string) {
  const request = useCallback(
    (input: { version?: number }) => confirmCharge(chargeId, input),
    [chargeId],
  );
  return useApiSubmit(request);
}

/** Rechazar un comprobante con motivo (`POST /charges/:id/reject`, RF-002-11). */
export function useRejectCharge(chargeId: string) {
  const request = useCallback(
    (input: RejectChargeRequest) => rejectCharge(chargeId, input),
    [chargeId],
  );
  return useApiSubmit(request);
}

/** Pedir la URL firmada de un comprobante (`GET /charges/:id/receipts/:rid/file`, RNF-002-01). */
export function useReceiptFile(chargeId: string) {
  const request = useCallback(
    (receiptId: string) => getReceiptFile(chargeId, receiptId),
    [chargeId],
  );
  return useApiSubmit(request);
}

/** Cobros por página del historial del grupo (contrato 000 A). */
export const GROUP_CHARGES_PAGE_SIZE = 20;

/**
 * Cobros de un grupo (`GET /groups/:id/charges`, RF-002-17) con filtros aplicados por la API.
 * Con `status: 'en_revision'` es la cola «Por revisar» del titular.
 */
export function useGroupCharges(groupId: string, filters: ListGroupChargesParams = {}) {
  const { period, status, userId } = filters;
  const loadPage = useCallback(
    (cursor?: string) =>
      listGroupCharges(groupId, {
        ...(period ? { period } : {}),
        ...(status ? { status } : {}),
        ...(userId ? { userId } : {}),
        limit: GROUP_CHARGES_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [groupId, period, status, userId],
  );
  return usePaginatedResource(loadPage);
}
