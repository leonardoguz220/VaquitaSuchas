import { resolveManualPaidAt } from './manual-payment.js';

describe('resolveManualPaidAt', () => {
  const issuedAt = new Date('2026-10-15T04:00:00Z');
  const now = new Date('2026-10-16T15:00:00Z');

  it('CA-002-14: sin fecha usa el instante actual', () => {
    expect(resolveManualPaidAt({ now, issuedAt, paidAt: null })).toEqual(now);
  });

  it('CA-002-14: acepta una fecha entre la emisión y ahora (límites incluidos)', () => {
    const mid = new Date('2026-10-16T01:00:00Z');
    expect(resolveManualPaidAt({ now, issuedAt, paidAt: mid })).toEqual(mid);
    expect(resolveManualPaidAt({ now, issuedAt, paidAt: issuedAt })).toEqual(issuedAt);
    expect(resolveManualPaidAt({ now, issuedAt, paidAt: now })).toEqual(now);
  });

  it('CA-002-14: rechaza una fecha anterior a la emisión', () => {
    expect(() =>
      resolveManualPaidAt({ now, issuedAt, paidAt: new Date('2026-10-15T03:59:59Z') }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', httpStatus: 400 }));
  });

  it('CA-002-14: rechaza una fecha futura o inválida', () => {
    expect(() =>
      resolveManualPaidAt({ now, issuedAt, paidAt: new Date('2026-10-17T00:00:00Z') }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => resolveManualPaidAt({ now, issuedAt, paidAt: new Date('x') })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
