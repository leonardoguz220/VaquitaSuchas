import {
  canOpenRequest,
  type CanOpenRequestInput,
} from '../../join-requests/domain/can-open-request.js';

export type CannotRequestReason =
  | 'VENTANA_CERRADA'
  | 'SOLICITUD_ACTIVA'
  | 'DEMASIADAS_SOLICITUDES'
  | 'COBROS_ABIERTOS'
  | 'SIN_CUPOS'
  | 'CUENTA_RESTRINGIDA';

// Orden en que se informa la primera regla incumplida (el contrato devuelve una sola).
const MAPPING: readonly (readonly [string, CannotRequestReason])[] = [
  ['account_restricted', 'CUENTA_RESTRINGIDA'],
  ['window_closed', 'VENTANA_CERRADA'],
  ['no_slots', 'SIN_CUPOS'],
  ['open_charges', 'COBROS_ABIERTOS'],
  ['active_request_in_group', 'SOLICITUD_ACTIVA'],
  ['too_many_active_requests', 'DEMASIADAS_SOLICITUDES'],
];

/**
 * `canRequest` y `cannotRequestReason` de `ListingView` con las mismas reglas que abrir una
 * solicitud (spec 010, `canOpenRequest`). El nivel «En riesgo» no impide solicitar (RN-008-06).
 */
export function requestEligibility(input: CanOpenRequestInput): {
  canRequest: boolean;
  cannotRequestReason: CannotRequestReason | null;
} {
  const broken = canOpenRequest(input);
  if (broken.length === 0) return { canRequest: true, cannotRequestReason: null };
  const found = MAPPING.find(([rule]) => (broken as string[]).includes(rule));
  return { canRequest: false, cannotRequestReason: found ? found[1] : 'CUENTA_RESTRINGIDA' };
}
