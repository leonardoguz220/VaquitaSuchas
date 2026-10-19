import { computeTotalBsCents, parseExchangeRate } from './money.js';

describe('computeTotalBsCents', () => {
  it('CA-001-04: USD 10,00 a 6,96 son Bs 69,60', () => {
    expect(computeTotalBsCents('USD', 1000, '6.96')).toBe(6960);
  });

  it('RN-001-04: en BS el total es el precio', () => {
    expect(computeTotalBsCents('BS', 2550)).toBe(2550);
  });

  it('RF-001-11: redondea mitad hacia arriba al centavo', () => {
    // 1 centavo × 6,9650 = 6,965 → 7; 1 × 6,9649 → 7 (6,9649 redondea a 7); 1 × 0,4999 → 0 → 0
    expect(computeTotalBsCents('USD', 1, '6.9650')).toBe(7);
    expect(computeTotalBsCents('USD', 1, '0.5000')).toBe(1);
    expect(computeTotalBsCents('USD', 1, '0.4999')).toBe(0);
    expect(computeTotalBsCents('USD', 3, '1.1667')).toBe(4);
  });

  it('RF-001-11: USD sin tipo de cambio válido lanza', () => {
    expect(() => computeTotalBsCents('USD', 1000, null)).toThrow();
    expect(() => computeTotalBsCents('USD', 1000, '0')).toThrow();
  });

  it('RF-001-11: coincide con round(precio × tasa) de la base en miles de combinaciones', () => {
    let seed = 12345;
    const next = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let i = 0; i < 5000; i++) {
      const price = 1 + next(500000);
      const rate4 = 1 + next(200000); // hasta 20,0000
      const rate = (rate4 / 10000).toFixed(4);
      // Referencia con aritmética entera exacta: round half up de price×rate4/10⁴.
      const exact = Math.floor((price * rate4 + 5000) / 10000);
      expect(computeTotalBsCents('USD', price, rate)).toBe(exact);
    }
  });
});

describe('parseExchangeRate', () => {
  it('RN-001-04: acepta positivos con hasta 4 decimales', () => {
    expect(parseExchangeRate('6.96')).toBe(69600);
    expect(parseExchangeRate('6.9600')).toBe(69600);
    expect(parseExchangeRate('7')).toBe(70000);
    expect(parseExchangeRate(6.96)).toBe(69600);
  });

  it('RN-001-04: rechaza cero, negativos, más de 4 decimales y texto', () => {
    for (const bad of ['0', '0.0000', '-1', '6.96001', 'abc', '', '6,96', '1e3']) {
      expect(parseExchangeRate(bad)).toBeNull();
    }
  });
});
