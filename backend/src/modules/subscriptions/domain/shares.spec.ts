import { splitShares } from './shares.js';

describe('splitShares', () => {
  it('CA-001-05: 100,00 entre 3 → 33,34 (titular) / 33,33 / 33,33', () => {
    expect(splitShares(10000, 3)).toEqual({
      baseShareCents: 3333,
      ownerShareCents: 3334,
      remainderCents: 1,
    });
  });

  it('CA-001-12: sin resto el titular paga la cuota base', () => {
    expect(splitShares(9000, 3)).toEqual({
      baseShareCents: 3000,
      ownerShareCents: 3000,
      remainderCents: 0,
    });
  });

  it('RN-001-02: un solo miembro paga todo', () => {
    expect(splitShares(6960, 1).ownerShareCents).toBe(6960);
  });

  it('CA-001-12: la suma de cuotas siempre es el total (propiedad)', () => {
    for (let total = 100; total <= 3000; total += 7) {
      for (let n = 1; n <= 12; n++) {
        const s = splitShares(total, n);
        expect(s.ownerShareCents + s.baseShareCents * (n - 1)).toBe(total);
        expect(s.remainderCents).toBeGreaterThanOrEqual(0);
        expect(s.remainderCents).toBeLessThan(n);
      }
    }
  });

  it('RN-001-02: rechaza miembros < 1 o totales inválidos', () => {
    expect(() => splitShares(100, 0)).toThrow();
    expect(() => splitShares(-1, 2)).toThrow();
    expect(() => splitShares(1.5, 2)).toThrow();
  });
});
