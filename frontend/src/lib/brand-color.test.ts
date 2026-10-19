import { brandTileColors, contrastRatio, FALLBACK_BRAND_COLOR, initialOf } from './brand-color';

describe('brandTileColors (CA-004-12)', () => {
  it('CA-004-12: usa el color de marca y la letra que más contrasta', () => {
    // Rojo de Netflix: la letra blanca contrasta más que ink.
    expect(brandTileColors('#E50914')).toEqual({ background: '#E50914', color: '#FFFFFF' });
    // Amarillo claro: la letra ink contrasta más que la blanca.
    expect(brandTileColors('#FFD60A')).toEqual({ background: '#FFD60A', color: '#17201C' });
  });

  it('CA-004-12: sin color de marca o con un valor inválido usa el verde de la marca', () => {
    for (const value of [null, undefined, '', 'red', '#FFF', '#GG0000']) {
      expect(brandTileColors(value).background).toBe(FALLBACK_BRAND_COLOR);
    }
  });

  it('la letra elegida cumple 3:1 (texto grande, WCAG AA) con cualquier color de marca', () => {
    for (const hex of [
      '#E50914',
      '#1DB954',
      '#113CCF',
      '#FF0000',
      '#808080',
      '#000000',
      '#FFFFFF',
    ]) {
      const { background, color } = brandTileColors(hex);
      expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('initialOf', () => {
  it('devuelve la primera letra en mayúscula sin espacios', () => {
    expect(initialOf('  netflix')).toBe('N');
    expect(initialOf('Ñandú TV')).toBe('Ñ');
    expect(initialOf('disney+')).toBe('D');
  });

  it('devuelve "?" con un nombre vacío', () => {
    expect(initialOf('   ')).toBe('?');
  });
});
