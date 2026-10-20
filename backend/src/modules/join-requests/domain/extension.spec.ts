import { DomainError } from '../../../shared/errors/domain-error.js';
import { planExtension } from './extension.js';

const now = new Date('2026-10-10T12:00:00Z');
const at = (min: number): Date => new Date(now.getTime() + min * 60_000);

describe('planExtension', () => {
  it('CA-010-42: concede 15 minutos más sobre el plazo vigente', () => {
    expect(
      planExtension({ status: 'esperando_pago', payDeadlineAt: at(5), extendedAt: null }, now),
    ).toEqual({ payDeadlineAt: at(20) });
  });

  it('CA-010-42: una segunda prórroga es ALREADY_EXTENDED (RF-010-28)', () => {
    try {
      planExtension({ status: 'esperando_pago', payDeadlineAt: at(20), extendedAt: now }, now);
      throw new Error('debía fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: 'ALREADY_EXTENDED',
        httpStatus: 422,
        details: { rule: 'RF-010-28' },
      });
    }
  });

  it('RF-010-28: fuera de esperando_pago o con el plazo vencido es INVALID_TRANSITION', () => {
    for (const input of [
      { status: 'abierta' as const, payDeadlineAt: null, extendedAt: null },
      { status: 'pago_informado' as const, payDeadlineAt: at(5), extendedAt: null },
      { status: 'esperando_pago' as const, payDeadlineAt: at(0), extendedAt: null },
    ]) {
      expect(() => planExtension(input, now)).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION', httpStatus: 409 }) as Error,
      );
    }
  });
});
