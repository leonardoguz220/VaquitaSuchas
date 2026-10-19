import { readFileSync } from 'node:fs';
import path from 'node:path';

// Reads the design tokens from globals.css (single source) and checks WCAG 2.1 AA contrast.
const css = readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match) throw new Error(`Token --color-${name} not found in globals.css`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const WHITE = '#ffffff';

describe('Tokens de diseño: contraste AA (RF-000-16)', () => {
  it.each([
    ['blanco sobre primary', WHITE, 'primary'],
    ['blanco sobre primary-hover', WHITE, 'primary-hover'],
    ['blanco sobre danger', WHITE, 'danger'],
    ['primary sobre surface', 'primary', 'surface'],
    ['primary sobre bg', 'primary', 'bg'],
    ['primary sobre primary-soft', 'primary', 'primary-soft'],
    ['primary-hover sobre primary-soft', 'primary-hover', 'primary-soft'],
    ['ink sobre surface', 'ink', 'surface'],
    ['ink sobre bg', 'ink', 'bg'],
    ['muted sobre surface', 'muted', 'surface'],
    ['muted sobre bg', 'muted', 'bg'],
    ['danger sobre surface', 'danger', 'surface'],
    ['danger-hover sobre atrasado', 'danger-hover', 'status-atrasado-bg'],
    ['pendiente', 'status-pendiente-fg', 'status-pendiente-bg'],
    ['en_revision', 'status-en-revision-fg', 'status-en-revision-bg'],
    ['pagado', 'status-pagado-fg', 'status-pagado-bg'],
    ['atrasado', 'status-atrasado-fg', 'status-atrasado-bg'],
    ['cancelado', 'status-cancelado-fg', 'status-cancelado-bg'],
  ])('RF-000-16: texto %s cumple 4.5:1', (_label, fg, bg) => {
    const fgHex = fg.startsWith('#') ? fg : token(fg);
    const bgHex = bg.startsWith('#') ? bg : token(bg);
    expect(contrast(fgHex, bgHex)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['surface', 'surface'],
    ['bg', 'bg'],
  ])('RF-000-16: el borde de campo sobre %s cumple 3:1 (WCAG 1.4.11)', (_label, bg) => {
    expect(contrast(token('field-border'), token(bg))).toBeGreaterThanOrEqual(3);
  });
});
