import { describe, expect, it } from '@jest/globals';
import { meetsHostThreshold } from './host-threshold.js';

describe('meetsHostThreshold', () => {
  it('CA-007-20: 6 cobros considerados y 4,5 estrellas habilita', () => {
    expect(meetsHostThreshold({ halfStars: 9, consideredCount: 6 })).toEqual({
      ok: true,
      missing: [],
    });
  });

  it('CA-007-20: con 5 cobros considerados no habilita y dice qué falta', () => {
    const result = meetsHostThreshold({ halfStars: 10, consideredCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1);
  });

  it('con 4 estrellas no habilita', () => {
    expect(meetsHostThreshold({ halfStars: 8, consideredCount: 12 }).ok).toBe(false);
  });

  it('«Nuevo» no habilita y reporta las dos faltas', () => {
    expect(meetsHostThreshold({ halfStars: null, consideredCount: 2 }).missing).toHaveLength(2);
  });
});
