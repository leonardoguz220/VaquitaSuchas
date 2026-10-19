import {
  formatCalendarDayLaPaz,
  formatDateLaPaz,
  formatDateTimeLaPaz,
  formatPeriod,
  formatRemaining,
  lapazDayOf,
  recentPeriods,
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

describe('formatCalendarDayLaPaz (RF-001-19)', () => {
  it('muestra el día que entrega la API sin correrlo por la zona horaria', () => {
    expect(formatCalendarDayLaPaz('2026-11-15')).toBe('15 nov 2026');
    expect(formatCalendarDayLaPaz('2027-01-01')).toBe('1 ene 2027');
  });

  it('rechaza un texto que no es YYYY-MM-DD', () => {
    expect(() => formatCalendarDayLaPaz('15/11/2026')).toThrow(RangeError);
    expect(() => formatCalendarDayLaPaz('2026-13-01')).toThrow(RangeError);
  });
});

describe('formatPeriod (RF-002-15)', () => {
  it('muestra el período YYYY-MM con el mes en palabras', () => {
    expect(formatPeriod('2026-10')).toBe('Octubre 2026');
    expect(formatPeriod('2027-01')).toBe('Enero 2027');
  });

  it('rechaza un texto que no es YYYY-MM', () => {
    expect(() => formatPeriod('2026-13')).toThrow(RangeError);
    expect(() => formatPeriod('oct 2026')).toThrow(RangeError);
  });
});

describe('recentPeriods (RF-002-15)', () => {
  it('parte del mes de La Paz y cruza el año hacia atrás', () => {
    // 1 feb 02:00 UTC todavía es 31 de enero en La Paz.
    expect(recentPeriods('2027-02-01T02:00:00Z', 3)).toEqual(['2027-01', '2026-12', '2026-11']);
  });
});

describe('formatRemaining (RF-002-09)', () => {
  it('junta días, horas y minutos en español', () => {
    expect(formatRemaining(90061)).toBe('1 día, 1 hora y 1 minuto');
    expect(formatRemaining(3 * 86400 + 5 * 3600)).toBe('3 días y 5 horas');
    expect(formatRemaining(120)).toBe('2 minutos');
    expect(formatRemaining(30)).toBe('menos de 1 minuto');
  });
});
