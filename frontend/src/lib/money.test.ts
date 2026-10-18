import { formatBs, formatUsd, parse, parseBsToCents } from './money';

describe('formatBs', () => {
  it('CA-000-11 formatea 250050 centavos como Bs 2.500,50', () => {
    expect(formatBs(250050)).toBe('Bs 2.500,50');
  });

  it('CA-000-11 formatea montos sin miles con coma decimal', () => {
    expect(formatBs(2550)).toBe('Bs 25,50');
    expect(formatBs(5)).toBe('Bs 0,05');
    expect(formatBs(99)).toBe('Bs 0,99');
    expect(formatBs(100)).toBe('Bs 1,00');
  });

  it('CA-000-11 formatea cero como Bs 0,00', () => {
    expect(formatBs(0)).toBe('Bs 0,00');
    expect(formatBs(-0)).toBe('Bs 0,00');
  });

  it('CA-000-11 pone el punto de miles en el borde exacto de 1.000', () => {
    expect(formatBs(99999)).toBe('Bs 999,99');
    expect(formatBs(100000)).toBe('Bs 1.000,00');
  });

  it('CA-000-11 usa varios separadores de miles en enteros grandes', () => {
    expect(formatBs(123456789)).toBe('Bs 1.234.567,89');
    expect(formatBs(Number.MAX_SAFE_INTEGER)).toBe('Bs 90.071.992.547.409,91');
  });

  it('CA-000-11 usa un espacio normal después de Bs', () => {
    expect(formatBs(2550).charAt(2)).toBe(' ');
  });

  it('CA-000-11 rechaza montos que no son centavos enteros', () => {
    expect(() => formatBs(25.5)).toThrow(RangeError);
    expect(() => formatBs(Number.NaN)).toThrow(RangeError);
    expect(() => formatBs(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatBs(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('CA-000-11 rechaza montos negativos', () => {
    expect(() => formatBs(-1)).toThrow(RangeError);
    expect(() => formatBs(-2550)).toThrow(RangeError);
  });
});

describe('formatUsd', () => {
  it('CA-000-11 formatea centavos de dólar con el mismo formato boliviano', () => {
    expect(formatUsd(1799)).toBe('USD 17,99');
    expect(formatUsd(0)).toBe('USD 0,00');
    expect(formatUsd(123456)).toBe('USD 1.234,56');
  });

  it('CA-000-11 rechaza montos en dólares no enteros o negativos', () => {
    expect(() => formatUsd(17.99)).toThrow(RangeError);
    expect(() => formatUsd(-1)).toThrow(RangeError);
  });
});

describe('parseBsToCents', () => {
  it('CA-000-11 convierte un texto en formato boliviano a centavos enteros', () => {
    expect(parseBsToCents('25,50')).toBe(2550);
    expect(parseBsToCents('2.500,50')).toBe(250050);
    expect(parseBsToCents('1.234,5')).toBe(123450);
    expect(parseBsToCents('25')).toBe(2500);
    expect(parseBsToCents('0,05')).toBe(5);
    expect(parseBsToCents('1234,56')).toBe(123456);
    expect(parseBsToCents('1.234.567,89')).toBe(123456789);
  });

  it('CA-000-11 acepta el prefijo Bs y espacios alrededor', () => {
    expect(parseBsToCents('Bs 25,50')).toBe(2550);
    expect(parseBsToCents('bs25,50')).toBe(2550);
    expect(parseBsToCents('  Bs 2.500,50  ')).toBe(250050);
  });

  it('CA-000-11 es inverso de formatBs', () => {
    for (const cents of [0, 5, 2550, 100000, 250050, 123456789]) {
      expect(parseBsToCents(formatBs(cents))).toBe(cents);
    }
  });

  it('CA-000-11 devuelve null para textos inválidos', () => {
    const invalid = [
      '',
      '   ',
      'Bs',
      'abc',
      '25,505',
      '25,',
      ',50',
      '-25,50',
      '25.50',
      '1.23,00',
      '12.3456',
      '1,234.56',
      '25 50',
      '1e3',
      'USD 25,50',
      '99999999999999999999',
    ];
    for (const text of invalid) {
      expect(parseBsToCents(text)).toBeNull();
    }
  });

  it('CA-000-11 exporta parse como alias de parseBsToCents (plan §6)', () => {
    expect(parse).toBe(parseBsToCents);
  });
});
