import { missedPeriods } from './missed-periods.js';

describe('missedPeriods (research R1, CA-002-22)', () => {
  it('períodos consecutivos: no falta ninguno', () => {
    expect(missedPeriods('2026-09', '2026-10')).toBe(0);
  });

  it('cuenta los períodos intermedios sin ciclo', () => {
    expect(missedPeriods('2026-08', '2026-10')).toBe(1);
    expect(missedPeriods('2026-01', '2026-10')).toBe(8);
  });

  it('cruza el cambio de año', () => {
    expect(missedPeriods('2025-12', '2026-01')).toBe(0);
    expect(missedPeriods('2025-11', '2026-02')).toBe(2);
  });

  it('no devuelve negativos si el período ya existe o es anterior', () => {
    expect(missedPeriods('2026-10', '2026-10')).toBe(0);
    expect(missedPeriods('2026-10', '2026-08')).toBe(0);
  });

  it('rechaza un período mal formado', () => {
    expect(() => missedPeriods('2026-13', '2026-10')).toThrow();
  });
});
