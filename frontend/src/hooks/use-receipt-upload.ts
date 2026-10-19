'use client';

import { useCallback } from 'react';
import { getCharge, uploadReceipt, type Charge, type UploadReceiptInput } from '@/services/charges';
import type { ApiError } from '@/services/http';
import { useApiSubmit } from './use-api-submit';

/** `stale`: hubo `409 STALE_STATE` y el cobro en pantalla ya se reemplazó por el recargado. */
export type ReceiptUploadResult =
  { ok: true; charge: Charge } | { ok: false; error: ApiError; stale: boolean } | null;

export interface UseReceiptUploadOptions {
  charge: Charge;
  /** Recibe el cobro que hay que mostrar (el devuelto por la API o el recargado). */
  onChargeChange: (charge: Charge) => void;
}

/**
 * `POST /charges/:chargeId/receipts` (RF-002-06 a 08) con la `version` del cobro en pantalla.
 * Ante `409 STALE_STATE` vuelve a pedir el cobro. Devuelve `null` si ya había un envío en curso
 * o llegó un `401`.
 */
export function useReceiptUpload({ charge, onChargeChange }: UseReceiptUploadOptions) {
  const chargeId = charge.id;
  const version = charge.version;
  const request = useCallback(
    (input: Omit<UploadReceiptInput, 'version'>) => uploadReceipt(chargeId, { ...input, version }),
    [chargeId, version],
  );
  const { submit: send, isSubmitting } = useApiSubmit(request);

  const submit = useCallback(
    async (input: Omit<UploadReceiptInput, 'version'>): Promise<ReceiptUploadResult> => {
      const result = await send(input);
      if (!result) return null;
      if (result.ok) {
        onChargeChange(result.data);
        return { ok: true, charge: result.data };
      }
      const stale = result.error.code === 'STALE_STATE';
      if (stale) {
        try {
          onChargeChange(await getCharge(chargeId));
        } catch {
          // Si la recarga falla, el aviso basta: el siguiente envío vuelve a responder 409.
        }
      }
      return { ok: false, error: result.error, stale };
    },
    [send, chargeId, onChargeChange],
  );

  return { submit, isSubmitting };
}
