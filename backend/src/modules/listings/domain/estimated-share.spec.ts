import { estimatedShare } from './estimated-share.js';

describe('estimatedShare', () => {
  it('CA-008-04: Bs 90,00 con 2 miembros y 1 cupo ofrecido → Bs 30,00', () => {
    expect(estimatedShare(9000, 2, 1)).toBe(3000);
  });

  it('RN-008-02: usa la cuota base (el resto no se reparte a la estimación)', () => {
    expect(estimatedShare(10001, 2, 1)).toBe(3333);
    expect(estimatedShare(10001, 2, 1)).toBe(3333);
  });

  it('RN-008-02: más cupos ofrecidos bajan la cuota', () => {
    expect(estimatedShare(9000, 2, 3)).toBeLessThan(estimatedShare(9000, 2, 1));
  });

  it('RN-008-02: rechaza totales o personas inválidos', () => {
    expect(() => estimatedShare(-1, 2, 1)).toThrow();
    expect(() => estimatedShare(9000, 0, 0)).toThrow();
  });
});
