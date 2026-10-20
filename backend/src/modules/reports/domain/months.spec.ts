import { describe, expect, it } from '@jest/globals';
import { cumulative, lastMonths } from './months.js';

describe('lastMonths', () => {
  it('CA-006-11: con 14 meses de datos devuelve los últimos 12', () => {
    const months = lastMonths('2026-10', '2025-09');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11');
    expect(months[11]).toBe('2026-10');
  });

  it('empieza en el primer mes con datos si hay menos de 12 y no deja huecos', () => {
    expect(lastMonths('2026-02', '2025-11')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('sin datos devuelve los n meses', () => {
    expect(lastMonths('2026-03', null, 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('cruza el año', () => {
    expect(lastMonths('2026-01', null, 2)).toEqual(['2025-12', '2026-01']);
  });
});

describe('cumulative', () => {
  it('acumula y marca «sin dato» mientras no haya ningún mes con dato', () => {
    const result = cumulative([
      { period: '2026-01', value: null },
      { period: '2026-02', value: 500 },
      { period: '2026-03', value: null },
      { period: '2026-04', value: -200 },
    ]);
    expect(result.map((p) => p.valueCents)).toEqual([0, 500, 500, 300]);
    expect(result.map((p) => p.withoutData)).toEqual([true, false, false, false]);
  });
});
