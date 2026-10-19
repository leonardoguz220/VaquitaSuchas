import { maskCi } from './ci-mask.js';

describe('maskCi', () => {
  it('CA-003-31: muestra solo los últimos 3 dígitos', () => {
    expect(maskCi('1234123')).toBe('*****123');
    expect(maskCi('1234567890')).toBe('*****890');
  });
});
