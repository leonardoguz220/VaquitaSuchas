import { describe, expect, it } from '@jest/globals';
import { savingsForLine, summarizeSavings } from './savings.js';

describe('savingsForLine', () => {
  it('CA-006-04: precio individual USD 10,00 a 6,96 y cuota Bs 20,00 ahorra Bs 49,60', () => {
    expect(savingsForLine(6960 * 1, 2000)).toBe(4960);
  });

  it('CA-006-05: sin precio individual no hay ahorro (sin dato)', () => {
    expect(savingsForLine(null, 2000)).toBeNull();
  });

  it('CA-006-21: puede ser cero o negativo', () => {
    expect(savingsForLine(2000, 2000)).toBe(0);
    expect(savingsForLine(1500, 2000)).toBe(-500);
  });
});

describe('summarizeSavings', () => {
  it('CA-006-05: excluye las líneas sin dato y las cuenta', () => {
    const summary = summarizeSavings([
      { individualPriceBsCents: 6960, shareCents: 2000 },
      { individualPriceBsCents: null, shareCents: 1500 },
    ]);
    expect(summary).toEqual({ totalCents: 4960, withoutData: 1, negativeNote: null });
  });

  it('el total es null si ninguna línea tiene dato', () => {
    expect(
      summarizeSavings([{ individualPriceBsCents: null, shareCents: 100 }]).totalCents,
    ).toBeNull();
    expect(summarizeSavings([]).totalCents).toBeNull();
  });

  it('CA-006-21: agrega la nota si alguna línea es negativa', () => {
    const summary = summarizeSavings([
      { individualPriceBsCents: 5000, shareCents: 1000 },
      { individualPriceBsCents: 1000, shareCents: 2000 },
    ]);
    expect(summary.totalCents).toBe(3000);
    expect(summary.negativeNote).not.toBeNull();
  });
});
