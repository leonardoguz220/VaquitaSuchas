import { DomainError } from '../../../shared/errors/domain-error.js';

export type RequestStatus =
  | 'abierta'
  | 'esperando_pago'
  | 'pago_informado'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'expirada';

export type RequestAction =
  | 'open'
  | 'sendPaymentData'
  | 'uploadProof'
  | 'cashPayment'
  | 'confirm'
  | 'reject'
  | 'cancel'
  | 'expire'
  | 'systemReject'
  | 'systemCancel';

export interface RequestTransitionContext {
  now: Date;
  /** La ventana de ingreso del grupo está abierta (RN-010-12). */
  windowOpen: boolean;
  /** Hay un cupo libre (RN-010-02). */
  slotAvailable: boolean;
  /** Plazo vigente del estado actual (abierta, pago o decisión); null si no aplica. */
  deadlineAt: Date | null;
  /** `otro_grupo`: cancelación del sistema por ingreso al mismo servicio (solo desde `abierta`). */
  reason?: 'otro_grupo';
}

export const FINAL_STATUSES: readonly RequestStatus[] = [
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
];

const invalid = (from: RequestStatus | null, action: RequestAction): DomainError =>
  new DomainError(
    'INVALID_TRANSITION',
    409,
    'Esa acción no es válida para el estado actual de la solicitud.',
    {
      from,
      action,
    },
  );

const isActive = (s: RequestStatus | null): boolean =>
  s === 'abierta' || s === 'esperando_pago' || s === 'pago_informado';

/**
 * Máquina de estados de una solicitud de ingreso (RN-010-05). `status` es null para una solicitud
 * nueva. Cualquier combinación no listada lanza `INVALID_TRANSITION` (409). Las condiciones de
 * ventana, cupo y plazo se evalúan con `ctx`; una condición incumplida también es inválida.
 */
export function transition(
  status: RequestStatus | null,
  action: RequestAction,
  ctx: RequestTransitionContext,
): RequestStatus {
  const due = ctx.deadlineAt !== null && ctx.now.getTime() >= ctx.deadlineAt.getTime();
  switch (action) {
    case 'open':
      if (status === null && ctx.windowOpen) return 'abierta';
      break;
    case 'sendPaymentData':
      if (status === 'abierta' && ctx.windowOpen && ctx.slotAvailable) return 'esperando_pago';
      break;
    case 'uploadProof':
      if (status === 'esperando_pago' && ctx.deadlineAt !== null && !due) return 'pago_informado';
      break;
    case 'cashPayment':
      if (status === 'esperando_pago') return 'aceptada';
      break;
    case 'confirm':
      if (status === 'pago_informado') return 'aceptada';
      break;
    case 'reject':
    case 'systemReject':
      if (isActive(status)) return 'rechazada';
      break;
    case 'cancel':
      if (status === 'abierta' || status === 'esperando_pago') return 'cancelada';
      break;
    case 'systemCancel':
      if (ctx.reason === 'otro_grupo' ? status === 'abierta' : isActive(status)) return 'cancelada';
      break;
    case 'expire':
      if (status === 'abierta' && (due || !ctx.windowOpen)) return 'expirada';
      if ((status === 'esperando_pago' || status === 'pago_informado') && due) return 'expirada';
      break;
  }
  throw invalid(status, action);
}
