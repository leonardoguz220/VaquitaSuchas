import { toLaPazParts } from './la-paz.js';

// CA-000-12 y RN-000-01: UTC internamente, America/La_Paz (UTC−4, sin horario de verano) al mostrar.

function local(iso: string): string {
  const p = toLaPazParts(new Date(iso));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

describe('toLaPazParts', () => {
  it('CA-000-12: 02:00 UTC del día 1 es las 22:00 del día anterior en La Paz', () => {
    expect(toLaPazParts(new Date('2026-02-01T02:00:00Z'))).toMatchObject({
      year: 2026,
      month: 1,
      day: 31,
      hour: 22,
      minute: 0,
      second: 0,
    });
  });

  it('CA-000-12: el día 1 de enero retrocede al 31 de diciembre del año anterior', () => {
    expect(local('2026-01-01T02:00:00Z')).toBe('2025-12-31 22:00:00');
  });

  it('CA-000-12: el 1 de marzo a las 03:59:59 UTC es el 28 de febrero a las 23:59:59 en año no bisiesto', () => {
    expect(local('2026-03-01T03:59:59Z')).toBe('2026-02-28 23:59:59');
  });

  it('CA-000-12: el 1 de marzo a las 03:59:59 UTC es el 29 de febrero a las 23:59:59 en año bisiesto', () => {
    expect(local('2028-03-01T03:59:59Z')).toBe('2028-02-29 23:59:59');
  });

  it('CA-000-12: 04:00 UTC es la medianoche exacta del mismo día en La Paz', () => {
    expect(local('2026-05-10T04:00:00Z')).toBe('2026-05-10 00:00:00');
  });

  it('CA-000-12: 03:59:59.999 UTC todavía pertenece al día anterior', () => {
    expect(toLaPazParts(new Date('2026-05-10T03:59:59.999Z'))).toMatchObject({
      day: 9,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
  });

  it('RN-000-01: el desfase es -4 h todo el año, sin horario de verano', () => {
    expect(local('2026-01-15T12:00:00Z')).toBe('2026-01-15 08:00:00');
    expect(local('2026-07-15T12:00:00Z')).toBe('2026-07-15 08:00:00');
  });

  it('RN-000-01: devuelve el día de la semana local (0 = domingo)', () => {
    // 2026-02-01 es domingo en UTC, pero a las 02:00 UTC en La Paz aún es sábado 31 de enero.
    expect(toLaPazParts(new Date('2026-02-01T02:00:00Z')).weekday).toBe(6);
    expect(toLaPazParts(new Date('2026-02-01T04:00:00Z')).weekday).toBe(0);
  });

  it('CA-000-12: una fecha inválida lanza un error claro', () => {
    expect(() => toLaPazParts(new Date(NaN))).toThrow(
      'Fecha inválida: no se puede convertir a la hora de La Paz.',
    );
  });

  it('RN-000-01: no modifica la fecha recibida', () => {
    const input = new Date('2026-02-01T02:00:00Z');
    toLaPazParts(input);
    expect(input.toISOString()).toBe('2026-02-01T02:00:00.000Z');
  });
});
