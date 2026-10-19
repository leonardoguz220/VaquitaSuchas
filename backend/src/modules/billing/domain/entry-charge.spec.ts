import { entryChargeDraft } from './entry-charge.js';

const snapshot = {
  priceCents: 10001,
  currency: 'BS' as const,
  exchangeRate: null,
  totalBsCents: 10001,
  memberCount: 4,
};
const now = new Date('2026-10-16T15:00:00Z');

describe('entryChargeDraft (RF-002-19, RN-002-10)', () => {
  it('RN-002-10: nace pagado, de origen y liquidación ingreso, con la copia cotizada', () => {
    expect(
      entryChargeDraft({ userId: 'u', period: '2026-10', amountCents: 2500, snapshot, now }),
    ).toMatchObject({
      userId: 'u',
      period: '2026-10',
      origin: 'ingreso',
      status: 'pagado',
      settlement: 'ingreso',
      amountCents: 2500,
      priceCents: 10001,
      memberCount: 4,
      issuedAt: now,
      paidAt: now,
    });
  });

  it.each([0, -1, 12.5, Number.NaN])('RF-002-19: rechaza el monto %p', (amountCents) => {
    expect(() =>
      entryChargeDraft({ userId: 'u', period: '2026-10', amountCents, snapshot, now }),
    ).toThrow(RangeError);
  });
});
