'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui';
import type { Charge } from '@/services/charges';
import { ChargeDetailView, type ChargeActionsContext } from './charge-detail';
import { OwnerReviewActions } from './owner-review-actions';
import type { ReviewNotice } from './owner-review-model';
import { ReceiptUpload } from './receipt-upload';
import { ReminderWhatsApp } from './reminder-whatsapp';

export interface ChargeActionsExtras {
  onNotice: (notice: ReviewNotice | null) => void;
}

/** Zona de acciones según `allowedActions` (el frontend no decide por estado ni rol). */
export function chargeActions(
  charge: Charge,
  context: ChargeActionsContext,
  extras: ChargeActionsExtras = { onNotice: () => {} },
) {
  const reviewing =
    charge.allowedActions.includes('confirm') || charge.allowedActions.includes('reject');
  return (
    <>
      {charge.allowedActions.includes('uploadReceipt') && (
        <ReceiptUpload key={charge.id} charge={charge} {...context} />
      )}
      {reviewing && <OwnerReviewActions charge={charge} {...context} {...extras} />}
      {/* Solo el titular puede registrar un pago manual, y solo en cobros por cobrar (RF-005-16). */}
      {charge.allowedActions.includes('manualPayment') && <ReminderWhatsApp chargeId={charge.id} />}
    </>
  );
}

/**
 * `/cobros/[id]` con su zona de acciones. Es de cliente porque `actions` es una función y no
 * puede pasar desde la página (componente de servidor). El aviso de confirmar o rechazar vive
 * aquí porque el panel del titular desaparece cuando la API ya no permite esas acciones.
 */
export function ChargePageView({ chargeId }: { chargeId: string }) {
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  return (
    <ChargeDetailView
      chargeId={chargeId}
      notice={
        notice && (
          <Alert variant={notice.variant} title={notice.title}>
            {notice.detail}
          </Alert>
        )
      }
      actions={(charge, context) => chargeActions(charge, context, { onNotice: setNotice })}
    />
  );
}
