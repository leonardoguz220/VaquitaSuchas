import { describe, expect, it } from '@jest/globals';
import { currentStreak } from './streak.js';

const item = (month: number, punctual: boolean) => ({
  dueAt: new Date(Date.UTC(2026, month - 1, 19)),
  punctual,
});

describe('currentStreak', () => {
  it('cuenta los puntuales más recientes consecutivos', () => {
    expect(currentStreak([item(5, true), item(6, true), item(7, true)])).toBe(3);
  });

  it('un cobro no puntual reinicia la racha a 0 (CA-007-09)', () => {
    expect(currentStreak([item(5, true), item(6, true), item(7, false)])).toBe(0);
  });

  it('ordena por vencimiento aunque lleguen desordenados', () => {
    expect(currentStreak([item(7, true), item(5, false), item(6, true)])).toBe(2);
  });

  it('sin cobros es 0', () => {
    expect(currentStreak([])).toBe(0);
  });
});
