import {
  adjustBillingDay,
  cutDateFor,
  dueAtFor,
  lastCutAtOrBefore,
  nextCutAfter,
  periodOf,
} from './billing-calendar.js';

// 00:00 en La Paz = 04:00 UTC.
const lp = (iso: string): Date => new Date(`${iso}:00.000-04:00`);

describe('adjustBillingDay', () => {
  it('CA-001-17: día 31 en febrero → 28 (2026 y 2100) o 29 (2028)', () => {
    expect(adjustBillingDay(2026, 2, 31)).toBe(28);
    expect(adjustBillingDay(2100, 2, 31)).toBe(28); // 2100 no es bisiesto
    expect(adjustBillingDay(2028, 2, 31)).toBe(29);
  });

  it('RN-001-06: 30 y 31 en meses cortos se ajustan; en meses largos no', () => {
    expect(adjustBillingDay(2026, 4, 31)).toBe(30);
    expect(adjustBillingDay(2026, 1, 31)).toBe(31);
    expect(adjustBillingDay(2026, 3, 15)).toBe(15);
  });
});

describe('cutDateFor y periodOf', () => {
  it('RN-001-06: el corte se ajusta y el período es AAAA-MM', () => {
    const cut = cutDateFor(2028, 2, 31);
    expect(cut).toEqual({ year: 2028, month: 2, day: 29 });
    expect(periodOf(cut)).toBe('2028-02');
  });
});

describe('dueAtFor', () => {
  it('RN-001-06: vence al empezar el día corte + 4 en La Paz', () => {
    expect(dueAtFor({ year: 2026, month: 10, day: 15 })).toEqual(lp('2026-10-19T00:00'));
  });

  it('RN-001-06: cruza fin de mes y de año', () => {
    expect(dueAtFor({ year: 2026, month: 12, day: 30 })).toEqual(lp('2027-01-03T00:00'));
    expect(dueAtFor({ year: 2026, month: 2, day: 28 })).toEqual(lp('2026-03-04T00:00'));
  });
});

describe('nextCutAfter', () => {
  it('RN-001-06: antes del corte del mes devuelve ese corte', () => {
    expect(nextCutAfter(lp('2026-10-10T12:00'), 15)).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it('RN-001-06: en el instante exacto del corte ya pasó el corte → el del mes siguiente', () => {
    expect(nextCutAfter(lp('2026-10-15T00:00'), 15)).toEqual({ year: 2026, month: 11, day: 15 });
  });

  it('CA-001-17: día 31 pasa a febrero ajustado y salta de diciembre a enero', () => {
    expect(nextCutAfter(lp('2026-01-31T10:00'), 31)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextCutAfter(lp('2028-01-31T10:00'), 31)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(nextCutAfter(lp('2100-01-31T10:00'), 31)).toEqual({ year: 2100, month: 2, day: 28 });
    expect(nextCutAfter(lp('2026-12-20T10:00'), 5)).toEqual({ year: 2027, month: 1, day: 5 });
  });

  it('RN-001-06: usa la fecha de La Paz, no la UTC (23:00 La Paz ya es el día siguiente en UTC)', () => {
    expect(nextCutAfter(lp('2026-10-14T23:30'), 15)).toEqual({ year: 2026, month: 10, day: 15 });
  });
});

describe('lastCutAtOrBefore', () => {
  const created = lp('2026-01-01T09:00');

  it('RN-001-06: devuelve el último corte regular ≤ now', () => {
    expect(lastCutAtOrBefore(lp('2026-10-20T10:00'), 15, created)).toEqual(lp('2026-10-15T00:00'));
  });

  it('RN-001-06: antes del corte del mes usa el del mes anterior (cruza año)', () => {
    expect(lastCutAtOrBefore(lp('2026-01-10T10:00'), 15, lp('2025-01-01T00:00'))).toEqual(
      lp('2025-12-15T00:00'),
    );
  });

  it('RN-001-06: la creación cuenta como corte inicial si es posterior al último corte regular', () => {
    const createdLate = lp('2026-10-18T09:00');
    expect(lastCutAtOrBefore(lp('2026-10-20T10:00'), 15, createdLate)).toEqual(createdLate);
  });

  it('CA-001-17: día 31 en febrero usa el 28/29', () => {
    expect(lastCutAtOrBefore(lp('2028-03-05T10:00'), 31, lp('2027-01-01T00:00'))).toEqual(
      lp('2028-02-29T00:00'),
    );
    expect(lastCutAtOrBefore(lp('2100-03-05T10:00'), 31, lp('2099-01-01T00:00'))).toEqual(
      lp('2100-02-28T00:00'),
    );
  });
});
