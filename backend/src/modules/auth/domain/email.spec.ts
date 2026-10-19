import { canonicalEmailForBan, normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('CA-003-35: recorta espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  Nombre@Example.COM ')).toBe('nombre@example.com');
  });
});

describe('canonicalEmailForBan', () => {
  it('CA-003-35: Gmail ignora puntos y alias con +', () => {
    expect(canonicalEmailForBan('n.o.m.b.r.e+1@gmail.com')).toBe('nombre@gmail.com');
    expect(canonicalEmailForBan('Nombre@Gmail.com')).toBe('nombre@gmail.com');
  });

  it('CA-003-35: googlemail se trata como gmail', () => {
    expect(canonicalEmailForBan('no.mbre+x@googlemail.com')).toBe('nombre@gmail.com');
  });

  it('CA-003-35: otros dominios quedan intactos (solo minúsculas y recorte)', () => {
    expect(canonicalEmailForBan(' No.Mbre+x@Example.com ')).toBe('no.mbre+x@example.com');
  });
});
