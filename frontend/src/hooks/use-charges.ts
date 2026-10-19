'use client';

import { useCallback } from 'react';
import {
  getCharge,
  listMyCharges,
  uploadReceipt,
  type ChargeStatus,
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
