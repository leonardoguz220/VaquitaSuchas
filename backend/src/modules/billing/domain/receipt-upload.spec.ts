import { DomainError } from '../../../shared/errors/domain-error.js';
import { planUpload } from './receipt-upload.js';

const now = new Date('2026-10-16T15:00:00Z');
const dueAt = new Date('2026-10-19T04:00:00Z');

describe('planUpload', () => {
  it('CA-002-04: un cobro pendiente pasa a en_revision', () => {
    expect(planUpload('pendiente', now, dueAt)).toEqual({ to: 'en_revision', replaced: false });
  });

  it('RN-002-01: un cobro atrasado también pasa a en_revision', () => {
    expect(planUpload('atrasado', now, dueAt)).toEqual({ to: 'en_revision', replaced: false });
  });

  it('RF-002-08: un cobro en revisión admite reemplazar sin cambiar de estado', () => {
    expect(planUpload('en_revision', now, dueAt)).toEqual({ to: 'en_revision', replaced: true });
  });

  it('RN-002-01: un cobro pagado o cancelado responde INVALID_TRANSITION con el mensaje del contrato', () => {
    for (const status of ['pagado', 'cancelado'] as const) {
      let error: unknown;
      try {
        planUpload(status, now, dueAt);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: 'INVALID_TRANSITION',
        httpStatus: 409,
        message: 'Este cobro ya no admite cambios.',
        details: { from: status, action: 'uploadReceipt' },
      });
    }
  });
});
