import { formatExchangeRate, parseExchangeRate } from './exchange-rate';

describe('lib/exchange-rate (RF-001-03)', () => {
  it.each([
    ['6,96', '6.9600'],
    ['6.96', '6.9600'],
    [' 7 ', '7.0000'],
    ['6,9654', '6.9654'],
    ['06,5', '6.5000'],
  ])('lee «%s» como %s', (text, expected) => {
    expect(parseExchangeRate(text)).toBe(expected);
  });

  it.each(['', '0', '0,00', 'abc', '6,96541', '-6,96', '6,96 Bs', '1.234,56'])(
    'rechaza «%s»',
    (text) => {
      expect(parseExchangeRate(text)).toBeNull();
    },
  );

  it.each([
    ['6.9600', '6,96'],
    ['6.9650', '6,965'],
    ['7.0000', '7,00'],
  ])('muestra %s como %s', (rate, expected) => {
    expect(formatExchangeRate(rate)).toBe(expected);
  });
});
