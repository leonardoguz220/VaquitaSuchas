import { formatExchangeRate, parseExchangeRateInput } from './exchange-rate';

describe('parseExchangeRateInput (RF-001-03)', () => {
  it('RF-001-03: acepta coma o punto y devuelve cuatro decimales con punto', () => {
    expect(parseExchangeRateInput('6,96')).toBe('6.9600');
    expect(parseExchangeRateInput('6.96')).toBe('6.9600');
    expect(parseExchangeRateInput(' 6,9633 ')).toBe('6.9633');
    expect(parseExchangeRateInput('7')).toBe('7.0000');
    expect(parseExchangeRateInput('0,5')).toBe('0.5000');
    expect(parseExchangeRateInput('007,1')).toBe('7.1000');
  });

  it('RF-001-03: rechaza vacío, cero, negativos, letras y más de cuatro decimales', () => {
    for (const text of ['', '0', '0,0000', '-6,96', 'abc', '6,96333', '6,', '1.234,5', '1234567']) {
      expect(parseExchangeRateInput(text)).toBeNull();
    }
  });
});

describe('formatExchangeRate', () => {
  it('RF-001-13: muestra el tipo de cambio de la API con coma y sin ceros de más', () => {
    expect(formatExchangeRate('6.9600')).toBe('6,96');
    expect(formatExchangeRate('6.9633')).toBe('6,9633');
    expect(formatExchangeRate('6.9630')).toBe('6,963');
    expect(formatExchangeRate('7')).toBe('7,00');
  });
});
