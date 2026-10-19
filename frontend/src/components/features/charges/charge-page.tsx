'use client';

import type { Charge } from '@/services/charges';
import { ChargeDetailView, type ChargeActionsContext } from './charge-detail';
import { ReceiptUpload } from './receipt-upload';

/**
 * Zona de acciones según `allowedActions` (el frontend no decide). T026 agrega aquí las del
 * titular (confirmar y rechazar) junto a la subida.
 */
export function chargeActions(charge: Charge, context: ChargeActionsContext) {
  return (
    <>
      {charge.allowedActions.includes('uploadReceipt') && (
        <ReceiptUpload key={charge.id} charge={charge} {...context} />
      )}
    </>
  );
}

/**
 * `/cobros/[id]` con su zona de acciones. Es de cliente porque `actions` es una función y no
 * puede pasar desde la página (componente de servidor).
 */
export function ChargePageView({ chargeId }: { chargeId: string }) {
  return <ChargeDetailView chargeId={chargeId} actions={chargeActions} />;
}
