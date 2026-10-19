import { monthGrid, shiftPeriod, WEEKDAYS } from './calendar-grid';

describe('calendar-grid (plan 006 §6)', () => {
  it('RF-006-11: octubre de 2026 empieza en jueves y tiene 31 días en 5 semanas', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[4]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('RF-006-11: febrero bisiesto tiene 29 días y febrero común 28', () => {
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid('2026-02').flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid('2026-02')[0][6]).toBe('2026-02-01');
  });

  it('RF-006-11: shiftPeriod cruza el año en ambos sentidos', () => {
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-10', 0)).toBe('2026-10');
    expect(() => shiftPeriod('2026-13', 1)).toThrow(RangeError);
  });

  it('RF-006-11: la semana va de lunes a domingo', () => {
    expect(WEEKDAYS.map((day) => day.short)).toEqual([
      'lun',
      'mar',
      'mié',
      'jue',
      'vie',
      'sáb',
      'dom',
    ]);
  });
});
