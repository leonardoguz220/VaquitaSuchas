import { normalizeReference } from './reference.js';

describe('normalizeReference', () => {
  it('CA-002-27: pasa a mayúsculas, recorta y colapsa espacios', () => {
    expect(normalizeReference('  abc   12 ')).toBe('ABC 12');
  });

  it('CA-002-27: no quita guiones ni ceros (A-001 y A001 son distintas)', () => {
    expect(normalizeReference('a-001')).toBe('A-001');
    expect(normalizeReference('a001')).toBe('A001');
    expect(normalizeReference('a-001')).not.toBe(normalizeReference('a001'));
  });

  it('CA-002-27: la misma referencia con distinta capitalización coincide', () => {
    expect(normalizeReference('Tx.123/ab_9')).toBe(normalizeReference(' tx.123/AB_9'));
  });

  it('CA-002-26: una referencia vacía o solo de espacios no es válida', () => {
    expect(normalizeReference('')).toBeNull();
    expect(normalizeReference('   ')).toBeNull();
  });

  it('CA-002-26: rechaza caracteres fuera de [A-Z0-9 ./_-] y más de 100 caracteres', () => {
    expect(normalizeReference('abc#1')).toBeNull();
    expect(normalizeReference('ñandú')).toBeNull();
    expect(normalizeReference('A'.repeat(100))).toBe('A'.repeat(100));
    expect(normalizeReference('A'.repeat(101))).toBeNull();
  });
});
