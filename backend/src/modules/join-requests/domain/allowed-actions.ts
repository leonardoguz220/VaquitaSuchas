import type { RequestStatus } from './request-state.js';

export type RequestActionName =
  | 'sendPaymentData'
  | 'extend'
  | 'uploadProof'
  | 'confirm'
  | 'cashPayment'
  | 'reject'
  | 'cancel'
  | 'sendMessage'
  | 'openDispute'
  | 'respondDispute';

export interface AllowedActionsInput {
  role: 'solicitante' | 'titular';
  /** Estado efectivo (plazos vencidos ya aplicados). */
  status: RequestStatus;
  extended: boolean;
  windowOpen: boolean;
  slotAvailable: boolean;
  canOpenDispute: boolean;
  canRespondDispute: boolean;
}

/**
 * Acciones que la persona puede intentar ahora según su papel y el estado (plan §7, RNF-010-01).
 * El servidor las vuelve a validar al ejecutarlas; el frontend solo dibuja esta lista.
 */
export function allowedActions(input: AllowedActionsInput): RequestActionName[] {
  const { role, status } = input;
  const actions: RequestActionName[] = [];
  const active = status === 'abierta' || status === 'esperando_pago' || status === 'pago_informado';
  if (role === 'solicitante') {
    if (status === 'esperando_pago') actions.push('uploadProof');
    if (status === 'abierta' || status === 'esperando_pago') actions.push('cancel');
  } else {
    if (status === 'abierta' && input.windowOpen && input.slotAvailable) {
      actions.push('sendPaymentData');
    }
    if (status === 'esperando_pago') {
      if (!input.extended) actions.push('extend');
      actions.push('cashPayment');
    }
    if (status === 'pago_informado') actions.push('confirm');
    if (active) actions.push('reject');
  }
  if (active) actions.push('sendMessage');
  if (input.canOpenDispute) actions.push('openDispute');
  if (input.canRespondDispute) actions.push('respondDispute');
  return actions;
}
