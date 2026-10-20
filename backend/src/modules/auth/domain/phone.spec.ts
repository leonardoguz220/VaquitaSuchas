import { normalizeBolivianPhone } from './phone.js';

describe('normalizeBolivianPhone', () => {
  it('CA-003-15: rechaza un celular de 7 dígitos', () => {
    expect(normalizeBolivianPhone('7123456')).toBeNull();
  });

  it('CA-003-15: acepta 8 dígitos que empiezan con 6 o 7', () => {
    expect(normalizeBolivianPhone('71234567')).toBe('+59171234567');
    expect(normalizeBolivianPhone('61234567')).toBe('+59161234567');
  });

  it('CA-003-15: acepta 591… y +591… con espacios o guiones', () => {
    expect(normalizeBolivianPhone('59171234567')).toBe('+59171234567');
    expect(normalizeBolivianPhone('+591 7123-4567')).toBe('+59171234567');
  });

  it('CA-003-15: rechaza números que no empiezan con 6 o 7 o de otro país', () => {
    expect(normalizeBolivianPhone('51234567')).toBeNull();
    expect(normalizeBolivianPhone('+5491112345678')).toBeNull();
    expect(normalizeBolivianPhone('+59151234567')).toBeNull();
    expect(normalizeBolivianPhone('abc')).toBeNull();
  });
});
