import { quoteEntryShare } from './entry-quote.js';

describe('quoteEntryShare', () => {
  it('CA-010-04: Bs 90,00 con 2 miembros → Bs 30,00', () => {
    expect(quoteEntryShare(9000, 2)).toBe(3000);
  });

  it('CA-010-05: Bs 100,00 con 2 miembros → Bs 33,33 (los centavos sobrantes los absorbe el titular)', () => {
    expect(quoteEntryShare(10000, 2)).toBe(3333);
  });

  it('RN-010-01: con solo el titular se divide entre 2', () => {
    expect(quoteEntryShare(6960, 1)).toBe(3480);
  });

  it('RN-010-01: rechaza totales o miembros inválidos', () => {
    expect(() => quoteEntryShare(0, 2)).toThrow();
    expect(() => quoteEntryShare(1000, 0)).toThrow();
    expect(() => quoteEntryShare(10.5, 2)).toThrow();
  });
});
