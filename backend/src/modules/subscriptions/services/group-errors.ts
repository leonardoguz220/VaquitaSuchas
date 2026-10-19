import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { GroupRow } from '../repositories/groups.repository.js';

/** 400 `VALIDATION_ERROR` con códigos por campo. */
export const fieldsError = (fields: Record<string, string[]>): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, { fields });

/** Un grupo cerrado o congelado solo se consulta (RN-001-07, RF-009-22). */
export function assertGroupWritable(group: Pick<GroupRow, 'status' | 'frozen_at'>): void {
  if (group.status === 'cerrado') {
    throw new DomainError('GROUP_CLOSED', 422, 'El grupo está cerrado y solo se puede consultar.', {
      rule: 'RN-001-07',
    });
  }
  if (group.frozen_at !== null) {
    throw new DomainError(
      'GROUP_FROZEN',
      422,
      'El grupo está congelado y solo se puede consultar.',
      { rule: 'RF-009-22' },
    );
  }
}
