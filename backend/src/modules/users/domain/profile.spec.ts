import { normalizeFullName } from './profile.js';

describe('normalizeFullName', () => {
  it('CA-003-14: recorta espacios y acepta de 2 a 80 caracteres', () => {
    expect(normalizeFullName('  Ana  ')).toBe('Ana');
    expect(normalizeFullName('Al')).toBe('Al');
    expect(normalizeFullName('x'.repeat(80))).toHaveLength(80);
  });

  it('CA-003-14: rechaza menos de 2 o más de 80', () => {
    expect(normalizeFullName('A')).toBeNull();
    expect(normalizeFullName('   ')).toBeNull();
    expect(normalizeFullName('x'.repeat(81))).toBeNull();
  });
});
