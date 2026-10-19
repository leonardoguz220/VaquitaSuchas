import { isPunctual, punctualityDate } from './punctuality.js';

const dueAt = new Date('2026-10-19T04:00:00Z'); // 00:00 del 19 en La Paz

describe('isPunctual', () => {
  it('RN-002-05: 23:59:59 del último día es puntual', () => {
    expect(isPunctual(new Date('2026-10-19T03:59:59Z'), dueAt)).toBe(true);
  });

  it('RN-002-05: 00:00 del día siguiente es tardío', () => {
    expect(isPunctual(new Date('2026-10-19T04:00:00Z'), dueAt)).toBe(false);
    expect(isPunctual(new Date('2026-10-19T04:05:00Z'), dueAt)).toBe(false);
  });
});

describe('punctualityDate', () => {
  const first = { submittedAt: new Date('2026-10-17T10:00:00Z') };
  const second = { submittedAt: new Date('2026-10-20T10:00:00Z') };

  it('RN-002-08: usa la primera subida', () => {
    expect(punctualityDate([second, first], [])).toEqual(first.submittedAt);
  });

  it('RN-002-08: un rechazo sin comprobante inválido no cambia la fecha', () => {
    const events = [{ type: 'rejected' as const, invalidReceipt: false, at: new Date() }];
    expect(punctualityDate([first, second], events)).toEqual(first.submittedAt);
  });

  it('RN-002-08: tras un rechazo con comprobante inválido usa la última subida', () => {
    const events = [{ type: 'rejected' as const, invalidReceipt: true, at: new Date() }];
    expect(punctualityDate([first, second], events)).toEqual(second.submittedAt);
  });

  it('RN-002-08: sin subidas no hay fecha', () => {
    expect(punctualityDate([], [])).toBeNull();
  });
});
