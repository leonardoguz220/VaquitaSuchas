import { describe, expect, it } from '@jest/globals';
import { percentCollected } from './collection.js';

describe('percentCollected', () => {
  it('CA-006-09: Bs 60,00 de Bs 90,00 es 67 %', () => {
    expect(percentCollected(6000, 9000)).toBe(67);
  });

  it('redondea la mitad hacia arriba', () => {
    expect(percentCollected(1, 200)).toBe(1); // 0,5 %
    expect(percentCollected(1, 8)).toBe(13); // 12,5 %
  });

  it('0 % y 100 %', () => {
    expect(percentCollected(0, 9000)).toBe(0);
    expect(percentCollected(9000, 9000)).toBe(100);
  });

  it('es null si lo esperado es 0', () => {
    expect(percentCollected(0, 0)).toBeNull();
  });
});
