import type { RoundStatus, RowState } from './state.js';

export type RowViewAction =
  | 'cover'
  | 'requestRefund'
  | 'pay'
  | 'confirmPayment'
  | 'rejectPayment'
  | 'sendRefund'
  | 'confirmRefund'
  | 'disputeRefund';

export type Viewer = 'titular' | 'afectado';

/**
 * Acciones que ofrece una fila según quién la consulta (el frontend solo muestra estas, RF-011-*).
 * Los plazos se validan al ejecutar la acción, no aquí.
 */
export function allowedRowActions(
  viewer: Viewer,
  roundStatus: RoundStatus,
  state: RowState,
  refundDueReached: boolean,
): RowViewAction[] {
  const actions: RowViewAction[] = [];
  const open = roundStatus === 'abierta';
  if (viewer === 'afectado') {
    if (open && state.choice === 'pendiente') actions.push('cover', 'requestRefund');
    if (open && state.choice === 'cubrir' && state.extra === 'pendiente_pago') actions.push('pay');
    if (state.refund === 'enviada') actions.push('confirmRefund', 'disputeRefund');
    if (state.refund === 'pendiente' && refundDueReached) actions.push('disputeRefund');
    return actions;
  }
  if (state.extra === 'informado') actions.push('confirmPayment', 'rejectPayment');
  if (state.refund === 'pendiente') actions.push('sendRefund');
  return actions;
}

/** La ronda solo se puede cancelar mientras está abierta y nadie respondió (RF-011-06). */
export function allowedRoundActions(
  viewer: Viewer,
  roundStatus: RoundStatus,
  rows: readonly RowState[],
): 'cancel'[] {
  if (viewer !== 'titular' || roundStatus !== 'abierta') return [];
  return rows.every((row) => row.choice === 'pendiente') ? ['cancel'] : [];
}
