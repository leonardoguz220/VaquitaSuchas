import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';

export const MAX_MANUAL_NOTE_LENGTH = 200;

const invalidDate = (): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { paidAt: ['INVALID_PAID_AT'] },
  });

/**
 * Fecha de pago de un pago manual (RF-002-12, RN-002-08, CA-002-14): por omisión `now`; si el
 * titular la indica debe estar entre la emisión del cobro y `now`. Fuera de rango: `400`.
 */
export function resolveManualPaidAt(input: {
  now: Date;
  issuedAt: Date;
  paidAt: Date | null;
}): Date {
  if (input.paidAt === null) return input.now;
  const time = input.paidAt.getTime();
  if (Number.isNaN(time) || time < input.issuedAt.getTime() || time > input.now.getTime()) {
    throw invalidDate();
  }
  return input.paidAt;
}
