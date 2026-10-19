// Colores del recuadro con la inicial de un servicio (spec 004, CA-004-12).
// Solo es presentación: elige el color de la letra que mejor contrasta con el color de marca.

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Color del recuadro cuando el servicio no tiene color de marca (token `primary`). */
export const FALLBACK_BRAND_COLOR = '#1E6B4E';

const WHITE = '#FFFFFF';
/** Token `ink`. */
const INK = '#17201C';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG 2.1 entre dos colores `#RRGGBB`. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

export interface TileColors {
  background: string;
  color: string;
}

/**
 * Fondo y color de letra para la inicial de un servicio. Usa `brandColor` si es un `#RRGGBB`
 * válido (el formato que exige la base, RN-004-04) y si no el verde de la marca. La letra es
 * blanca o `ink`, la que contraste más con el fondo.
 */
export function brandTileColors(brandColor: string | null | undefined): TileColors {
  const background = brandColor && HEX_COLOR.test(brandColor) ? brandColor : FALLBACK_BRAND_COLOR;
  const color = contrastRatio(WHITE, background) >= contrastRatio(INK, background) ? WHITE : INK;
  return { background, color };
}

/** Inicial en mayúscula de un nombre (`"disney+"` → `"D"`), o `"?"` si está vacío. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase('es-BO') : '?';
}
