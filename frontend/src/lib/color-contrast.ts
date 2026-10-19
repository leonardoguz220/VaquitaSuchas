// Contraste de color según WCAG 2.1 (luminancia relativa). Solo presentación: elige el color
// del texto que va sobre un fondo que entrega la API, como el `brandColor` de un servicio.

/** Contraste mínimo para texto normal (WCAG 2.1 AA, criterio 1.4.3). */
export const MIN_TEXT_CONTRAST = 4.5;

export const WHITE = '#ffffff';
/** Token `ink` de `app/globals.css`. */
export const INK = '#17201c';
/** Último recurso: sobre cualquier fondo donde el blanco no llega a 4.5:1, el negro sí. */
export const BLACK = '#000000';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Indica si el valor es un color `#RRGGBB`, el formato que exige `brand_color` en la base. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste entre dos colores `#RRGGBB` (de 1 a 21), en cualquier orden. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * Color del texto para escribir sobre `background` con al menos 4.5:1: blanco si alcanza; si no,
 * `ink`; y en los tonos medios donde ninguno de los dos llega (por ejemplo `#7F7F7F`), negro,
 * que siempre alcanza cuando el blanco no lo hace.
 */
export function readableTextColor(background: string): string {
  for (const candidate of [WHITE, INK]) {
    if (contrastRatio(candidate, background) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return BLACK;
}
