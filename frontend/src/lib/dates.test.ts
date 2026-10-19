import {
  formatCalendarDate,
  formatDateLaPaz,
  formatDateTimeLaPaz,
  formatDeadlineLaPaz,
  formatPeriod,
  formatTimeLeft,
  lapazDayOf,
} from './dates';

describe('formatDateTimeLaPaz (RF-000-17)', () => {
  it('CA-000-12 muestra las 02:00 UTC del día 1 como las 22:00 del día anterior en La Paz', () => {
    expect(formatDateTimeLaPaz('2026-02-01T02:00:00Z')).toBe('31 ene 2026, 22:00');
  });

  it('CA-000-12 cruza el fin de febrero (ejemplo de quickstart §6)', () => {
    expect(formatDateTimeLaPaz('2026-03-01T02:00:00Z')).toBe('28 feb 2026, 22:00');
  });

  it('CA-000-12 cruza el fin de año', () => {
    expect(formatDateTimeLaPaz('2027-01-01T03:59:00Z')).toBe('31 dic 2026, 23:59');
    expect(formatDateTimeLaPaz('2027-01-01T04:00:00Z')).toBe('1 ene 2027, 00:00');
  });

  it('CA-000-12 respeta el 29 de febrero de un año bisiesto', () => {
    expect(formatDateTimeLaPaz('2028-03-01T02:00:00Z')).toBe('29 feb 2028, 22:00');
  });

  it('CA-000-12 aplica UTC-4 todo el año, sin horario de verano', () => {
    expect(formatDateTimeLaPaz('2026-07-15T16:30:00Z')).toBe('15 jul 2026, 12:30');
    expect(formatDateTimeLaPaz('2026-12-15T16:30:00Z')).toBe('15 dic 2026, 12:30');
  });

  it('CA-000-12 respeta el desfase de la cadena ISO de entrada', () => {
    expect(formatDateTimeLaPaz('2026-02-01T02:00:00+00:00')).toBe('31 ene 2026, 22:00');
    expect(formatDateTimeLaPaz('2026-01-31T22:00:00-04:00')).toBe('31 ene 2026, 22:00');
  });

  it('CA-000-12 usa la abreviatura de cada mes sin punto y con espacios normales', () => {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun'];
    months.push('jul', 'ago', 'sep', 'oct', 'nov', 'dic');
    months.forEach((month, index) => {
      const iso = `2026-${String(index + 1).padStart(2, '0')}-15T16:00:00Z`;
      expect(formatDateTimeLaPaz(iso)).toBe(`15 ${month} 2026, 12:00`);
    });
    expect(formatDateTimeLaPaz('2026-03-01T02:00:00Z')).toMatch(/^[0-9a-z, :]+$/);
  });

  it('CA-000-12 acepta un objeto Date', () => {
    expect(formatDateTimeLaPaz(new Date('2026-03-01T02:00:00Z'))).toBe('28 feb 2026, 22:00');
  });

  it('CA-000-12 lanza RangeError ante una fecha inválida', () => {
    expect(() => formatDateTimeLaPaz('no es una fecha')).toThrow(RangeError);
    expect(() => formatDateTimeLaPaz('')).toThrow(RangeError);
    expect(() => formatDateTimeLaPaz('2026-13-01T00:00:00Z')).toThrow(RangeError);
    expect(() => formatDateTimeLaPaz(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('formatDateLaPaz', () => {
  it('CA-000-12 muestra solo la fecha del día en La Paz', () => {
    expect(formatDateLaPaz('2026-03-01T02:00:00Z')).toBe('28 feb 2026');
    expect(formatDateLaPaz('2026-02-01T02:00:00Z')).toBe('31 ene 2026');
    expect(formatDateLaPaz('2026-02-01T04:00:00Z')).toBe('1 feb 2026');
  });

  it('CA-000-12 lanza RangeError ante una fecha inválida', () => {
    expect(() => formatDateLaPaz('2026-02-30T25:00:00Z')).toThrow(RangeError);
  });
});

describe('lapazDayOf', () => {
  it('CA-000-12 devuelve el día de La Paz en formato YYYY-MM-DD', () => {
    expect(lapazDayOf('2026-02-01T02:00:00Z')).toBe('2026-01-31');
    expect(lapazDayOf('2026-03-01T02:00:00Z')).toBe('2026-02-28');
    expect(lapazDayOf('2026-02-01T04:00:00Z')).toBe('2026-02-01');
    expect(lapazDayOf('2027-01-01T03:59:59.999Z')).toBe('2026-12-31');
  });

  it('CA-000-12 lanza RangeError ante una fecha inválida', () => {
    expect(() => lapazDayOf('mañana')).toThrow(RangeError);
  });
});

describe('formatCalendarDate', () => {
  it('RF-001-19: da formato a un día YYYY-MM-DD de La Paz sin cambiar de zona', () => {
    expect(formatCalendarDate('2026-11-01')).toBe('1 nov 2026');
    expect(formatCalendarDate('2028-02-29')).toBe('29 feb 2028');
  });

  it('lanza RangeError con un texto que no es una fecha válida', () => {
    for (const value of ['2026-02-30', '2026-13-01', '01/11/2026', '']) {
      expect(() => formatCalendarDate(value)).toThrow(RangeError);
    }
  });
});

describe('formatPeriod (spec 002)', () => {
  it('RF-002-15: muestra el período YYYY-MM con el nombre del mes', () => {
    expect(formatPeriod('2026-10')).toBe('Octubre 2026');
    expect(formatPeriod('2027-01')).toBe('Enero 2027');
  });

  it('lanza RangeError con un período inválido', () => {
    for (const value of ['2026-13', '2026-1', 'octubre', '']) {
      expect(() => formatPeriod(value)).toThrow(RangeError);
    }
  });
});

describe('formatDeadlineLaPaz (spec 002)', () => {
  it('RF-002-03: el instante exclusivo 00:00 del día 22 se muestra como 21, 23:59 en La Paz', () => {
    expect(formatDeadlineLaPaz('2026-10-22T04:00:00.000Z')).toBe('21 oct 2026, 23:59');
  });

  it('RF-002-03: un vencimiento por emisión tardía conserva su minuto', () => {
    expect(formatDeadlineLaPaz('2026-10-25T14:42:30.000Z')).toBe('25 oct 2026, 10:42');
  });
});

describe('formatTimeLeft (spec 002)', () => {
  it('RF-002-09: da formato a los segundos que faltan, sin calcular el vencimiento', () => {
    expect(formatTimeLeft(3 * 86400 + 4 * 3600 + 59)).toBe('Faltan 3 días y 4 h');
    expect(formatTimeLeft(86400)).toBe('Faltan 1 día');
    expect(formatTimeLeft(5 * 3600 + 20 * 60 + 10)).toBe('Faltan 5 h 20 min');
    expect(formatTimeLeft(12 * 60)).toBe('Faltan 12 min');
    expect(formatTimeLeft(59)).toBe('Falta menos de 1 minuto');
    expect(formatTimeLeft(-5)).toBe('Falta menos de 1 minuto');
  });
});
