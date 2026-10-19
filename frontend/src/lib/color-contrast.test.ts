import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BLACK,
  INK,
  MIN_TEXT_CONTRAST,
  WHITE,
  contrastRatio,
  isHexColor,
  readableTextColor,
} from './color-contrast';

const css = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');

describe('lib/color-contrast (CA-004-12: inicial legible sobre el color de marca)', () => {
  it('CA-004-12: contrastRatio sigue la fórmula de WCAG 2.1 (blanco/negro 21:1, iguales 1:1)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#1E6B4E', '#1e6b4e')).toBeCloseTo(1, 5);
    // Valor documentado en globals.css: blanco sobre primary 6.43.
    expect(contrastRatio(WHITE, '#1E6B4E')).toBeCloseTo(6.43, 2);
  });

  it('CA-004-12: INK es el token ink de globals.css', () => {
    expect(css).toMatch(new RegExp(`--color-ink:\\s*${INK};`, 'i'));
  });

  it.each([
    ['rojo de marca oscuro', '#A4161A', WHITE],
    ['verde de marca', '#14743A', WHITE],
    ['azul oscuro', '#1D3A8A', WHITE],
    ['amarillo claro', '#FFD60A', INK],
    ['verde claro', '#1DB954', INK],
    ['blanco', '#FFFFFF', INK],
  ])('CA-004-12: sobre %s (%s) elige %s', (_label, background, expected) => {
    expect(readableTextColor(background)).toBe(expected);
  });

  it.each([
    '#A4161A',
    '#E50914',
    '#1DB954',
    '#FFD60A',
    '#0F5E8C',
    '#777777',
    '#7F7F7F',
    '#8A8A8A',
    '#FF6A00',
    '#00A8E1',
    '#000000',
    '#FFFFFF',
  ])('CA-004-12: el color elegido sobre %s cumple al menos 4.5:1', (background) => {
    expect(contrastRatio(readableTextColor(background), background)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it('CA-004-12: en tonos medios donde ni blanco ni ink llegan a 4.5:1, usa negro', () => {
    const mid = '#7F7F7F';
    expect(contrastRatio(WHITE, mid)).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(contrastRatio(INK, mid)).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(readableTextColor(mid)).toBe(BLACK);
  });

  it('CA-004-12: isHexColor acepta solo #RRGGBB, como la restricción de brand_color', () => {
    expect(isHexColor('#E50914')).toBe(true);
    expect(isHexColor('#e50914')).toBe(true);
    expect(isHexColor('#FFF')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#GGGGGG')).toBe(false);
    expect(isHexColor('E50914')).toBe(false);
  });
});
