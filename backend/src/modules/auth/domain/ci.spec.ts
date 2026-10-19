import { normalizeCi } from './ci.js';

describe('normalizeCi', () => {
  it('CA-003-31: quita espacios y deja solo dígitos', () => {
    expect(normalizeCi(' 1234 567 ')).toBe('1234567');
  });

  it('CA-003-31: acepta de 5 a 10 dígitos', () => {
    expect(normalizeCi('12345')).toBe('12345');
    expect(normalizeCi('1234567890')).toBe('1234567890');
  });

  it('CA-003-31: rechaza menos de 5 o más de 10 dígitos', () => {
    expect(normalizeCi('1234')).toBeNull();
    expect(normalizeCi('12345678901')).toBeNull();
  });

  it('CA-003-31: rechaza caracteres que no son dígitos', () => {
    expect(normalizeCi('1234a567')).toBeNull();
    expect(normalizeCi('1234-567')).toBeNull();
    expect(normalizeCi('')).toBeNull();
  });
});
