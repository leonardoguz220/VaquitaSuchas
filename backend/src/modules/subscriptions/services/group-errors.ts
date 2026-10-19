import { DomainError } from '../../../shared/errors/domain-error.js';

/** El grupo está cerrado y solo se puede consultar (RN-001-07). */
export const groupClosed = (): DomainError =>
  new DomainError('GROUP_CLOSED', 422, 'El grupo está cerrado y solo se puede consultar.', {
    rule: 'RN-001-07',
  });

/** El grupo está congelado por el baneo del titular y solo se puede consultar (RF-009-22). */
export const groupFrozen = (): DomainError =>
  new DomainError('GROUP_FROZEN', 422, 'El grupo está congelado y solo se puede consultar.', {
    rule: 'RF-009-22',
  });
