import { DomainError } from '../../../shared/errors/domain-error.js';

export type RoundStatus = 'abierta' | 'cerrada' | 'cancelada';
export type Choice = 'pendiente' | 'cubrir' | 'devolucion' | 'sin_respuesta';
export type ExtraStatus = 'no_aplica' | 'pendiente_pago' | 'informado' | 'confirmado' | 'vencido';
export type RefundStatus = 'no_aplica' | 'pendiente' | 'enviada' | 'confirmada' | 'disputada';

/** Estado de una fila de la ronda: lo que decidió la persona y cómo van su pago y su devolución. */
export interface RowState {
  choice: Choice;
  extra: ExtraStatus;
  refund: RefundStatus;
}

export type RowAction =
  | 'cover'
  | 'requestRefund'
  | 'pay'
  | 'confirmPayment'
  | 'rejectPayment'
  | 'sendRefund'
  | 'confirmRefund'
  | 'disputeRefund'
  | 'expireResponse'
  | 'expirePayment';

export interface RowContext {
  now: Date;
  /** Fin del plazo para responder (RF-011-04). */
  respondBy: Date;
  /** Fin del plazo para pagar el extra; null si no corre. */
  extraDeadlineAt: Date | null;
  /** Desde cuándo se puede disputar una devolución sin registrar; null si no hay devolución. */
  refundDueAt: Date | null;
}

export const NEW_ROW: RowState = { choice: 'pendiente', extra: 'no_aplica', refund: 'no_aplica' };

const invalid = (state: RowState, action: RowAction): DomainError =>
  new DomainError('INVALID_TRANSITION', 409, 'Esa acción no es válida para el estado actual.', {
    from: { choice: state.choice, extra: state.extra, refund: state.refund },
    action,
  });

const deadlinePassed = (): DomainError =>
  new DomainError('DEADLINE_PASSED', 422, 'El plazo para esta acción venció.', {
    rule: 'RF-011-04',
  });

const passed = (now: Date, limit: Date | null): boolean =>
  limit !== null && now.getTime() >= limit.getTime();

const REFUND_OPEN: Pick<RowState, 'refund'> = { refund: 'pendiente' };

/**
 * Máquina de estados de una fila de la ronda (spec 011 §7, CA-011-15). Devuelve el estado nuevo;
 * cualquier combinación no listada lanza `INVALID_TRANSITION` (409) y un plazo vencido, `DEADLINE_PASSED`
 * (422). Quién puede pedir cada acción lo decide el servicio con `allowedActions`.
 */
export function transitionRow(state: RowState, action: RowAction, ctx: RowContext): RowState {
  switch (action) {
    case 'cover':
      if (state.choice !== 'pendiente') break;
      if (passed(ctx.now, ctx.respondBy)) throw deadlinePassed();
      return { choice: 'cubrir', extra: 'pendiente_pago', refund: 'no_aplica' };
    case 'requestRefund':
      if (state.choice !== 'pendiente') break;
      if (passed(ctx.now, ctx.respondBy)) throw deadlinePassed();
      return { choice: 'devolucion', extra: 'no_aplica', ...REFUND_OPEN };
    case 'pay':
      if (state.choice !== 'cubrir' || state.extra !== 'pendiente_pago') break;
      if (passed(ctx.now, ctx.extraDeadlineAt)) throw deadlinePassed();
      return { ...state, extra: 'informado' };
    case 'confirmPayment':
      if (state.extra !== 'informado') break;
      return { ...state, extra: 'confirmado' };
    case 'rejectPayment':
      if (state.extra !== 'informado') break;
      return { ...state, extra: 'pendiente_pago' };
    case 'expireResponse':
      if (state.choice !== 'pendiente' || !passed(ctx.now, ctx.respondBy)) break;
      return { choice: 'sin_respuesta', extra: 'no_aplica', ...REFUND_OPEN };
    case 'expirePayment':
      if (state.extra !== 'pendiente_pago' || !passed(ctx.now, ctx.extraDeadlineAt)) break;
      return { choice: 'sin_respuesta', extra: 'vencido', ...REFUND_OPEN };
    case 'sendRefund':
      if (state.refund !== 'pendiente') break;
      return { ...state, refund: 'enviada' };
    case 'confirmRefund':
      if (state.refund !== 'enviada') break;
      return { ...state, refund: 'confirmada' };
    case 'disputeRefund':
      if (state.refund === 'enviada') return { ...state, refund: 'disputada' };
      // RF-011-12: sin registro del titular, solo después de que vence el plazo de la devolución.
      if (state.refund === 'pendiente' && passed(ctx.now, ctx.refundDueAt)) {
        return { ...state, refund: 'disputada' };
      }
      break;
  }
  throw invalid(state, action);
}

/** Una fila está resuelta cuando ya no espera nada de la persona ni del titular sobre el pago. */
export function isRowResolved(state: RowState): boolean {
  if (state.choice === 'pendiente') return false;
  if (state.choice === 'cubrir') return state.extra === 'confirmado';
  return true;
}

/** Una ronda abierta se cierra cuando todas sus filas están resueltas (RF-011-14). */
export function canCloseRound(rows: readonly RowState[]): boolean {
  return rows.every(isRowResolved);
}

/** `abierta → cerrada | cancelada`; los finales no cambian. */
export function transitionRound(
  status: RoundStatus,
  action: 'close' | 'cancel',
): Exclude<RoundStatus, 'abierta'> {
  if (status === 'abierta') return action === 'close' ? 'cerrada' : 'cancelada';
  throw new DomainError('INVALID_TRANSITION', 409, 'La ronda ya no admite cambios.', {
    from: status,
    action,
  });
}
