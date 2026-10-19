'use client';

import { ChargeDetailView } from './charge-detail';

/**
 * `/cobros/[id]` con su zona de acciones. Es de cliente porque `actions` es una función y no
 * puede pasar desde la página (componente de servidor). T022 y T026 montan aquí sus
 * componentes según `allowedActions`; en T018 la pantalla es de solo lectura.
 */
export function ChargePageView({ chargeId }: { chargeId: string }) {
  return <ChargeDetailView chargeId={chargeId} />;
}
