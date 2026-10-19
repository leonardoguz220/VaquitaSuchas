import { DomainError } from '../../../shared/errors/domain-error.js';
import { transition, type ChargeStatus } from './charge-state.js';

export interface UploadPlan {
  /** Estado del cobro después de la subida. */
  to: ChargeStatus;
  /** Reemplaza al comprobante vigente (el cobro ya estaba en revisión, RF-002-08). */
  replaced: boolean;
}

/**
 * Qué pasa con el cobro al subir un comprobante. Un cobro `pendiente` o `atrasado` pasa a
 * `en_revision` por `transition` (RN-002-01); uno que ya está `en_revision` permite reemplazar el
 * comprobante sin cambiar de estado (RF-002-08). Uno `pagado` o `cancelado` ya no admite cambios.
 */
export function planUpload(status: ChargeStatus, now: Date, dueAt: Date): UploadPlan {
  if (status === 'en_revision') return { to: 'en_revision', replaced: true };
  try {
    return { to: transition(status, 'uploadReceipt', { now, dueAt }), replaced: false };
  } catch (error) {
    if (error instanceof DomainError && error.code === 'INVALID_TRANSITION') {
      throw new DomainError(error.code, error.httpStatus, 'Este cobro ya no admite cambios.', {
        from: status,
        action: 'uploadReceipt',
      });
    }
    throw error;
  }
}
