import { CATEGORIES, categoryLabel, isCategory } from './categories.js';

describe('categorías del catálogo', () => {
  it('RF-004-03: son las seis categorías cerradas, con etiqueta para mostrar', () => {
    expect(CATEGORIES.map((c) => c.value)).toEqual([
      'video',
      'musica',
      'juegos',
      'educacion',
      'almacenamiento',
      'otras',
    ]);
    expect(categoryLabel('musica')).toBe('Música');
    expect(categoryLabel('educacion')).toBe('Educación');
  });

  it('RF-004-03: isCategory solo acepta valores de la lista cerrada', () => {
    expect(isCategory('video')).toBe(true);
    expect(isCategory('Video')).toBe(false);
    expect(isCategory('peliculas')).toBe(false);
  });
});
