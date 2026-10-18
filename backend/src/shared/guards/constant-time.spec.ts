import { constantTimeEquals } from './constant-time.js';

describe('constantTimeEquals (RF-000-11)', () => {
  it('RF-000-11: textos idénticos son iguales', () => {
    expect(constantTimeEquals('token-largo-de-prueba', 'token-largo-de-prueba')).toBe(true);
  });

  it.each([
    ['distinto mismo largo', 'abcdef', 'abcdeg'],
    ['más corto', 'abc', 'abcdef'],
    ['más largo', 'abcdefg', 'abcdef'],
    ['vacío', '', 'abcdef'],
    ['otra capitalización', 'ABCDEF', 'abcdef'],
  ])('RF-000-11: %s no es igual y no lanza por la diferencia de longitud', (_name, a, b) => {
    expect(constantTimeEquals(a, b)).toBe(false);
  });

  it('RF-000-11: dos textos vacíos son iguales', () => {
    expect(constantTimeEquals('', '')).toBe(true);
  });
});
