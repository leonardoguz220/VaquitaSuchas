import { DomainError } from '../../../shared/errors/domain-error.js';
import { computeDeadlines } from './deadlines.js';
import type { RequestStatus } from './request-state.js';

export interface ExtensionInput {
  status: RequestStatus;
  payDeadlineAt: Date | null;
  extendedAt: Date | null;
}

/**
 * Prórroga del plazo de pago (RF-010-28): solo en `esperando_pago` con el plazo vigente y una
 * sola vez. Devuelve el nuevo plazo (+15 min sobre el actual, RN-010-06).
 */
export function planExtension(input: ExtensionInput, now: Date): { payDeadlineAt: Date } {
  const { status, payDeadlineAt, extendedAt } = input;
  if (status !== 'esperando_pago' || payDeadlineAt === null || now >= payDeadlineAt) {
    throw new DomainError(
      'INVALID_TRANSITION',
      409,
      'Esa acción no es válida para el estado actual de la solicitud.',
      { from: status, action: 'extend' },
    );
  }
  if (extendedAt !== null) {
    throw new DomainError('ALREADY_EXTENDED', 422, 'El plazo de pago ya se prorrogó una vez.', {
      rule: 'RF-010-28',
    });
  }
  const next = computeDeadlines('extension', now, { currentPayDeadlineAt: payDeadlineAt });
  return { payDeadlineAt: next.payDeadlineAt as Date };
}
