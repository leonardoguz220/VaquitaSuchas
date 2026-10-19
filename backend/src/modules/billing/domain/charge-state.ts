import { DomainError } from '../../../shared/errors/domain-error.js';

export type ChargeStatus = 'pendiente' | 'en_revision' | 'pagado' | 'atrasado' | 'cancelado';

export type ChargeAction =
  | 'generate'
  | 'entryPaid'
  | 'uploadReceipt'
  | 'markOverdue'
  | 'confirm'
  | 'reject'
  | 'manualPayment'
  | 'cancel';

export interface TransitionContext {
  now: Date;
  dueAt: Date;
}

export const FINAL_STATUSES: readonly ChargeStatus[] = ['pagado', 'cancelado'];

const invalid = (from: ChargeStatus | null, action: ChargeAction): DomainError =>
  new DomainError(
    'INVALID_TRANSITION',
    409,
    'Esa acción no es válida para el estado actual del cobro.',
    {
      from,
      action,
    },
  );

/**
 * Máquina de estados de un cobro (RN-002-01). `status` es null para un cobro nuevo (`generate`,
 * `entryPaid`). `reject` vuelve a `pendiente` si `now < dueAt` y a `atrasado` si ya venció.
 * `markOverdue` solo vale una vez pasado el vencimiento. Cualquier otra combinación lanza
 * `INVALID_TRANSITION` (409).
 */
export function transition(
  status: ChargeStatus | null,
  action: ChargeAction,
  ctx: TransitionContext,
): ChargeStatus {
  const open = status === 'pendiente' || status === 'atrasado';
  switch (action) {
    case 'generate':
      if (status === null) return 'pendiente';
      break;
    case 'entryPaid':
      if (status === null) return 'pagado';
      break;
    case 'uploadReceipt':
      if (open) return 'en_revision';
      break;
    case 'markOverdue':
      if (status === 'pendiente' && ctx.now.getTime() >= ctx.dueAt.getTime()) return 'atrasado';
      break;
    case 'confirm':
      if (status === 'en_revision') return 'pagado';
      break;
    case 'reject':
      if (status === 'en_revision') {
        return ctx.now.getTime() >= ctx.dueAt.getTime() ? 'atrasado' : 'pendiente';
      }
      break;
    case 'manualPayment':
      if (open) return 'pagado';
      break;
    case 'cancel':
      if (open) return 'cancelado';
      break;
  }
  throw invalid(status, action);
}
