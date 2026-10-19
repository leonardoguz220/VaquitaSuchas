'use client';

import { useCallback } from 'react';
import {
  confirmCharge,
  getCharge,
  rejectCharge,
  type Charge,
  type RejectChargeInput,
} from '@/services/charges';
import type { ApiError } from '@/services/http';
import { useApiSubmit, type ApiSubmitResult } from './use-api-submit';

/** `stale`: hubo `409 STALE_STATE` y el cobro en pantalla ya se reemplazó por el recargado. */
export type OwnerReviewResult =
  { ok: true; charge: Charge } | { ok: false; error: ApiError; stale: boolean } | null;

export interface UseOwnerReviewActionsOptions {
  charge: Charge;
  /** Recibe el cobro que hay que mostrar (el devuelto por la API o el recargado). */
  onChargeChange: (charge: Charge) => void;
}

/**
 * `POST /charges/:chargeId/confirm` y `/reject` (RF-002-10, RF-002-11) con la `version` del
 * cobro en pantalla. Ante `409 STALE_STATE` vuelve a pedir el cobro. Devuelve `null` si ya había
 * un envío en curso o llegó un `401`.
 */
export function useOwnerReviewActions({ charge, onChargeChange }: UseOwnerReviewActionsOptions) {
  const chargeId = charge.id;
  const version = charge.version;

  const confirmRequest = useCallback(
    () => confirmCharge(chargeId, { version }),
    [chargeId, version],
  );
  const rejectRequest = useCallback(
    (input: Omit<RejectChargeInput, 'version'>) => rejectCharge(chargeId, { ...input, version }),
    [chargeId, version],
  );
  const confirmSubmit = useApiSubmit<void, Charge>(confirmRequest);
  const rejectSubmit = useApiSubmit(rejectRequest);

  const settle = useCallback(
    async (result: ApiSubmitResult<Charge> | null): Promise<OwnerReviewResult> => {
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
          // Si la recarga falla, el aviso basta: la siguiente acción vuelve a responder 409.
        }
      }
      return { ok: false, error: result.error, stale };
    },
    [chargeId, onChargeChange],
  );

  const { submit: sendConfirm } = confirmSubmit;
  const { submit: sendReject } = rejectSubmit;
  const confirm = useCallback(async () => settle(await sendConfirm()), [settle, sendConfirm]);
  const reject = useCallback(
    async (input: Omit<RejectChargeInput, 'version'>) => settle(await sendReject(input)),
    [settle, sendReject],
  );

  return {
    confirm,
    reject,
    isConfirming: confirmSubmit.isSubmitting,
    isRejecting: rejectSubmit.isSubmitting,
  };
}
