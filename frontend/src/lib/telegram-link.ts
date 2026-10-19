/**
 * Utilidades del enlace al bot de Telegram (`https://t.me/<bot>?start=<token>`, contrato 003).
 */

/** Devuelve el token del parámetro `start` del enlace, o `null` si no hay o no es una URL. */
export function extractStartToken(telegramUrl: string | null | undefined): string | null {
  if (!telegramUrl) return null;
  try {
    return new URL(telegramUrl).searchParams.get('start') || null;
  } catch {
    return null;
  }
}

/** Indica si dos fechas ISO 8601 son el mismo instante (aunque cambie el formato). */
export function isSameInstant(a: string, b: string): boolean {
  const first = Date.parse(a);
  const second = Date.parse(b);
  return !Number.isNaN(first) && first === second;
}

/** Segundos como `mm:ss` (por ejemplo, 582 → `09:42`). */
export function formatMinutesSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
