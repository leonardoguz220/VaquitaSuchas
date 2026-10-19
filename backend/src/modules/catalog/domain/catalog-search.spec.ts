import { escapeLike, normalizeSearchTerm } from './catalog-search.js';

describe('normalizeSearchTerm', () => {
  it('CA-004-03: recorta, pasa a minúsculas y quita tildes', () => {
    expect(normalizeSearchTerm('  Música ')).toBe('musica');
    expect(normalizeSearchTerm('EDUCACIÓN')).toBe('educacion');
    expect(normalizeSearchTerm('Canción')).toBe('cancion');
  });

  it('CA-004-03: la ñ pierde la tilde como en la base', () => {
    expect(normalizeSearchTerm('Piñata')).toBe('pinata');
    expect(normalizeSearchTerm('ÑANDÚ')).toBe('nandu');
  });

  it('CA-004-03: colapsa los espacios repetidos', () => {
    expect(normalizeSearchTerm('  hbo \t  max  ')).toBe('hbo max');
  });

  it('RF-004-04: se limita a 60 caracteres', () => {
    expect(normalizeSearchTerm('a'.repeat(100))).toHaveLength(60);
  });

  it('RF-004-04: un texto vacío o solo de espacios da cadena vacía', () => {
    expect(normalizeSearchTerm('   ')).toBe('');
  });
});

describe('escapeLike', () => {
  it('RF-004-04: escapa %, _ y la barra para que no actúen como comodines', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
    expect(escapeLike('netflix')).toBe('netflix');
  });
});
