export const MAX_REFERENCE_LENGTH = 100;

/**
 * `reference_key` de un comprobante (research R3): mayúsculas, recorte y espacios internos
 * colapsados. No quita guiones ni ceros (`A-001` ≠ `A001`). Devuelve null si queda vacía, pasa de
 * 100 caracteres o tiene caracteres fuera de `[A-Z0-9 ./_-]`.
 */
export function normalizeReference(text: string): string | null {
  const key = text.trim().replace(/\s+/g, ' ').toUpperCase();
  if (key.length === 0 || key.length > MAX_REFERENCE_LENGTH) return null;
  return /^[A-Z0-9 ./_-]+$/.test(key) ? key : null;
}
