import { formatBsCents } from './format-bs.js';

// Mismo formato que CA-000-11 del frontend (T022 es la utilidad del backend para correo y Telegram).

describe('formatBsCents', () => {
  it.each([
    [250050, 'Bs 2.500,50'],
    [2550, 'Bs 25,50'],
    [0, 'Bs 0,00'],
    [100000000, 'Bs 1.000.000,00'],
  ])('T022: %i centavos se muestran como «%s»', (cents, expected) => {
    expect(formatBsCents(cents)).toBe(expected);
  });

  it.each([
    [1, 'Bs 0,01'],
    [9, 'Bs 0,09'],
    [10, 'Bs 0,10'],
    [99, 'Bs 0,99'],
    [100, 'Bs 1,00'],
    [99999, 'Bs 999,99'],
    [100000, 'Bs 1.000,00'],
    [123456789, 'Bs 1.234.567,89'],
  ])('T022: %i centavos conservan ceros y separadores de miles (%s)', (cents, expected) => {
    expect(formatBsCents(cents)).toBe(expected);
  });

  it('T022: soporta el mayor entero seguro sin perder dígitos', () => {
    expect(formatBsCents(Number.MAX_SAFE_INTEGER)).toBe('Bs 90.071.992.547.409,91');
  });

  it.each([[25.5], [0.1], [NaN], [Infinity], [-Infinity], [Number.MAX_SAFE_INTEGER + 2]])(
    'T022: rechaza %p porque no es un entero de centavos',
    (value) => {
      expect(() => formatBsCents(value)).toThrow('El monto debe ser un entero de centavos.');
    },
  );

  it('T022: rechaza un valor que no es número', () => {
    expect(() => formatBsCents('2550' as unknown as number)).toThrow(
      'El monto debe ser un entero de centavos.',
    );
  });

  it('T022: rechaza montos negativos', () => {
    expect(() => formatBsCents(-1)).toThrow('El monto no puede ser negativo.');
  });
});
